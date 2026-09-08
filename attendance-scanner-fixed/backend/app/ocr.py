import base64
import re
from difflib import SequenceMatcher

import cv2
import numpy as np
import pytesseract


def decode_base64_image(b64_str: str) -> np.ndarray:
    """Decode a base64 data-URL or raw base64 string into an OpenCV BGR image."""
    if "," in b64_str and b64_str.strip().startswith("data:"):
        b64_str = b64_str.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_str)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def sharpness_score(img: np.ndarray) -> float:
    """Higher = sharper/more readable. Uses Laplacian variance (blur detection)
    combined with a simple contrast measure."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    contrast = gray.std()
    return float(laplacian_var + contrast)


def pick_best_frame(images: list[np.ndarray]) -> np.ndarray:
    if len(images) == 1:
        return images[0]
    scores = [sharpness_score(img) for img in images]
    best_idx = int(np.argmax(scores))
    return images[best_idx]


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def deskew_and_crop(img: np.ndarray) -> np.ndarray:
    """Find the ID card's outline and perspective-warp it flat.

    Unlike Tesseract's OSD (which only corrects 90-degree multiples and
    fails on arbitrary tilts like 45 degrees), this finds the card's actual
    rectangular edges via contour detection and geometrically un-warps it
    to any angle. Falls back gracefully to a simple rotation, or the
    original image, if no clean card outline is found.
    """
    h0, w0 = img.shape[:2]
    work_w = 700
    scale = work_w / w0 if w0 > work_w else 1.0
    small = cv2.resize(img, (int(w0 * scale), int(h0 * scale))) if scale != 1.0 else img.copy()

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img

    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    card_contour = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < 0.15 * small.shape[0] * small.shape[1]:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            card_contour = approx.reshape(4, 2)
            break

    if card_contour is None:
        # Fallback: rotate using the largest contour's minAreaRect angle.
        largest = contours[0]
        if cv2.contourArea(largest) < 0.1 * small.shape[0] * small.shape[1]:
            return img
        rect = cv2.minAreaRect(largest)
        angle = rect[-1]
        if angle < -45:
            angle += 90
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        m = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    pts = card_contour.astype("float32") / scale
    rect = _order_corners(pts)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = int(max(width_a, width_b))
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = int(max(height_a, height_b))
    if max_width < 50 or max_height < 50:
        return img

    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    m = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(img, m, (max_width, max_height))

    # ID cards print landscape; if the crop came out portrait, rotate 90.
    if warped.shape[0] > warped.shape[1] * 1.2:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)

    return warped


def preprocess_for_ocr(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 3)  # cheaper than bilateralFilter, still denoises
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    return thresh


def _fix_upside_down(processed: np.ndarray) -> np.ndarray:
    """Once the card has been deskewed it's axis-aligned, so Tesseract's OSD
    only has to tell 0 vs 180 (or an occasional 90/270) apart, which it does
    quickly and reliably — unlike trying to OSD an arbitrarily tilted image."""
    try:
        osd = pytesseract.image_to_osd(processed, config="--psm 0")
        rotate_match = re.search(r"Rotate: (\d+)", osd)
        angle = int(rotate_match.group(1)) if rotate_match else 0
        if angle == 180:
            processed = cv2.rotate(processed, cv2.ROTATE_180)
        elif angle == 90:
            processed = cv2.rotate(processed, cv2.ROTATE_90_COUNTERCLOCKWISE)
        elif angle == 270:
            processed = cv2.rotate(processed, cv2.ROTATE_90_CLOCKWISE)
    except Exception:
        pass  # OSD can still fail on very unclear images; fall back to as-is
    return processed


def run_ocr(img: np.ndarray) -> str:
    img = deskew_and_crop(img)
    processed = preprocess_for_ocr(img)
    processed = _fix_upside_down(processed)
    text = pytesseract.image_to_string(processed, config="--oem 3 --psm 6")
    return text.strip()


# Matches labels the way they actually print on most Indian college ID cards,
# e.g. "ROLL NO.: 26-27/69", "ID NO.: 5867278", "NAME : EPILI SUNIL NARSING".
# \b(?:no\.?|number)? handles cards that say just "ROLL" or "ROLL NUMBER" too.
_ROLL_RE = re.compile(r"roll\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9\-/]+)", re.IGNORECASE)
_ID_RE = re.compile(r"\bid\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9\-/]+)", re.IGNORECASE)
# Anchored to start-of-line so it grabs the label's own line only, not the
# whole rest of the card (re.MULTILINE makes ^/$ match per line).
_NAME_RE = re.compile(r"^\s*name\s*[:\-]?\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)

# Lines containing any of these are never the student's name — they're a label,
# a course/div field, a signature line, or the college's own header text.
_NAME_EXCLUDE_KEYWORDS = (
    "roll", "id no", "id number", "college", "university", "society",
    "course", "div", "sign", "principal", "autonomous", "naac", "marg",
    "nagar", "mumbai", "student card",
)


def extract_fields(raw_text: str) -> dict:
    roll_no = None
    id_no = None
    name = None

    roll_match = _ROLL_RE.search(raw_text)
    if roll_match:
        roll_no = roll_match.group(1).strip()

    id_match = _ID_RE.search(raw_text)
    if id_match:
        id_no = id_match.group(1).strip()

    # 1. Preferred: an explicit "NAME :" label, same as Roll No / ID No.
    #    Cards almost always print one, so this is far more reliable than
    #    guessing from line shape.
    name_match = _NAME_RE.search(raw_text)
    if name_match:
        candidate = name_match.group(1).strip(" :-")
        if candidate:
            name = candidate

    # 2. Fallback heuristic (only if no "NAME :" label was found/read): the
    #    longest mostly-alphabetic line that isn't a label/header/course/div
    #    line and isn't the roll/id value itself.
    if not name:
        candidate_lines = []
        for line in raw_text.splitlines():
            clean = line.strip()
            if not clean or len(clean) < 3:
                continue
            lower = clean.lower()
            if any(kw in lower for kw in _NAME_EXCLUDE_KEYWORDS):
                continue
            if any(ch.isdigit() for ch in clean):
                continue
            letters = sum(c.isalpha() or c.isspace() for c in clean)
            if letters / max(len(clean), 1) > 0.9:
                candidate_lines.append(clean)

        if candidate_lines:
            name = max(candidate_lines, key=len).strip()

    return {"roll_no": roll_no, "id_no": id_no, "name": name}


def names_match(a: str, b: str, threshold: float = 0.82) -> bool:
    """Whitespace/case-tolerant fuzzy name comparison."""
    norm_a = " ".join(a.lower().split())
    norm_b = " ".join(b.lower().split())
    return SequenceMatcher(None, norm_a, norm_b).ratio() >= threshold

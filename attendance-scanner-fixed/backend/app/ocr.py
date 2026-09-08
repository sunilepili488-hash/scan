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
    scores = [sharpness_score(img) for img in images]
    best_idx = int(np.argmax(scores))
    return images[best_idx]


def preprocess_for_ocr(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    return thresh


def run_ocr(img: np.ndarray) -> str:
    processed = preprocess_for_ocr(img)
    # OCR the original orientation. The card may be rotated by the student;
    # pytesseract's OSD (orientation & script detection) helps auto-correct.
    try:
        osd = pytesseract.image_to_osd(processed)
        rotate_match = re.search(r"Rotate: (\d+)", osd)
        angle = int(rotate_match.group(1)) if rotate_match else 0
        if angle != 0:
            (h, w) = processed.shape[:2]
            center = (w // 2, h // 2)
            m = cv2.getRotationMatrix2D(center, -angle, 1.0)
            processed = cv2.warpAffine(processed, m, (w, h))
    except Exception:
        pass  # OSD can fail on very unclear images; fall back to as-is

    text = pytesseract.image_to_string(processed)
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

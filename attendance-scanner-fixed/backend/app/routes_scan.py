from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from .auth import get_current_teacher_id
from .schemas import ScanExtractResult
from .ocr import decode_base64_image, pick_best_frame, run_ocr, extract_fields

router = APIRouter(prefix="/api/scan", tags=["scan"])


class ScanExtractRequest(BaseModel):
    frames: list[str]  # base64 data-URL strings, one per captured frame (1-6s window)


@router.post("/extract", response_model=ScanExtractResult)
def extract(payload: ScanExtractRequest, teacher_id: str = Depends(get_current_teacher_id)):
    if not payload.frames:
        raise HTTPException(status_code=400, detail="No frames received.")

    try:
        images = [decode_base64_image(f) for f in payload.frames]
        images = [img for img in images if img is not None]
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the captured image.")

    if not images:
        raise HTTPException(status_code=400, detail="Could not read the captured image.")

    best = pick_best_frame(images)
    raw_text = run_ocr(best)

    if not raw_text or len(raw_text.strip()) < 3:
        return ScanExtractResult(roll_no=None, id_no=None, name=None, raw_text="", readable=False)

    fields = extract_fields(raw_text)
    return ScanExtractResult(
        roll_no=fields["roll_no"],
        id_no=fields["id_no"],
        name=fields["name"],
        raw_text=raw_text,
        readable=True,
    )

from datetime import datetime, date

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from .db import supabase
from .auth import get_current_teacher_id
from .schemas import (
    SessionStart,
    SessionOut,
    SessionDetail,
    AttendanceRecordOut,
    ScanMatchResult,
    ManualPresentRequest,
)
from .ocr import decode_base64_image, pick_best_frame, run_ocr, extract_fields, names_match

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class ScanMatchRequest(BaseModel):
    frames: list[str]


def _normalize(s: str | None) -> str:
    return (s or "").strip().lower()


@router.post("/start", response_model=SessionOut)
def start_session(payload: SessionStart, teacher_id: str = Depends(get_current_teacher_id)):
    roster = (
        supabase.table("students")
        .select("id")
        .eq("teacher_id", teacher_id)
        .eq("year", payload.year)
        .execute()
    )
    total = len(roster.data)

    row = {
        "teacher_id": teacher_id,
        "year": payload.year,
        "course": payload.course,
        "session_date": date.today().isoformat(),
        "total_students": total,
        "present_count": 0,
    }
    result = supabase.table("attendance_sessions").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not start session.")
    return result.data[0]


@router.post("/{session_id}/scan", response_model=ScanMatchResult)
def scan_and_match(
    session_id: str,
    payload: ScanMatchRequest,
    teacher_id: str = Depends(get_current_teacher_id),
):
    session_res = (
        supabase.table("attendance_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    session = session_res.data[0]

    if not payload.frames:
        raise HTTPException(status_code=400, detail="No frames received.")

    try:
        images = [decode_base64_image(f) for f in payload.frames]
        images = [img for img in images if img is not None]
    except Exception:
        images = []

    scanned_count = _current_present_count(session_id)

    if not images:
        return ScanMatchResult(status="not_scanned", scanned_count=scanned_count)

    best = pick_best_frame(images)
    raw_text = run_ocr(best)

    if not raw_text or len(raw_text.strip()) < 3:
        return ScanMatchResult(status="not_scanned", scanned_count=scanned_count)

    fields = extract_fields(raw_text)
    roll_no, id_no, name = fields["roll_no"], fields["id_no"], fields["name"]

    if not roll_no and not id_no and not name:
        return ScanMatchResult(status="not_scanned", scanned_count=scanned_count)

    roster = (
        supabase.table("students")
        .select("*")
        .eq("teacher_id", teacher_id)
        .eq("year", session["year"])
        .execute()
    ).data

    matched_student = None
    matched_on = None

    if roll_no:
        for s in roster:
            if _normalize(s["roll_no"]) == _normalize(roll_no):
                matched_student, matched_on = s, "roll_no"
                break

    if not matched_student and id_no:
        for s in roster:
            if s.get("id_no") and _normalize(s["id_no"]) == _normalize(id_no):
                matched_student, matched_on = s, "id_no"
                break

    if not matched_student and name:
        for s in roster:
            if names_match(s["name"], name):
                matched_student, matched_on = s, "name"
                break

    if not matched_student:
        return ScanMatchResult(status="no_match", scanned_count=scanned_count)

    existing = (
        supabase.table("attendance_records")
        .select("id")
        .eq("session_id", session_id)
        .eq("student_id", matched_student["id"])
        .execute()
    )
    if existing.data:
        return ScanMatchResult(
            status="already_marked",
            student_name=matched_student["name"],
            student_roll_no=matched_student["roll_no"],
            matched_on=matched_on,
            scanned_count=scanned_count,
        )

    supabase.table("attendance_records").insert(
        {
            "session_id": session_id,
            "student_id": matched_student["id"],
            "roll_no": matched_student["roll_no"],
            "status": "present",
            "matched_on": matched_on,
            "scanned_at": datetime.utcnow().isoformat(),
        }
    ).execute()

    new_count = scanned_count + 1
    supabase.table("attendance_sessions").update({"present_count": new_count}).eq(
        "id", session_id
    ).execute()

    return ScanMatchResult(
        status="matched",
        student_name=matched_student["name"],
        student_roll_no=matched_student["roll_no"],
        matched_on=matched_on,
        scanned_count=new_count,
    )


def _current_present_count(session_id: str) -> int:
    res = (
        supabase.table("attendance_records")
        .select("id", count="exact")
        .eq("session_id", session_id)
        .eq("status", "present")
        .execute()
    )
    return res.count or 0


@router.post("/{session_id}/manual-present", response_model=AttendanceRecordOut)
def manual_present(
    session_id: str,
    payload: ManualPresentRequest,
    teacher_id: str = Depends(get_current_teacher_id),
):
    session_res = (
        supabase.table("attendance_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    student_res = (
        supabase.table("students")
        .select("*")
        .eq("id", payload.student_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not student_res.data:
        raise HTTPException(status_code=404, detail="Student not found.")
    student = student_res.data[0]

    existing = (
        supabase.table("attendance_records")
        .select("*")
        .eq("session_id", session_id)
        .eq("student_id", student["id"])
        .execute()
    )

    if existing.data:
        record = (
            supabase.table("attendance_records")
            .update({"status": "present_manual"})
            .eq("id", existing.data[0]["id"])
            .execute()
        ).data[0]
    else:
        record = (
            supabase.table("attendance_records")
            .insert(
                {
                    "session_id": session_id,
                    "student_id": student["id"],
                    "roll_no": student["roll_no"],
                    "status": "present_manual",
                    "matched_on": None,
                    "scanned_at": datetime.utcnow().isoformat(),
                }
            )
            .execute()
        ).data[0]
        new_count = _current_present_count(session_id) + 1  # includes present_manual? recompute below

    present_count = (
        supabase.table("attendance_records")
        .select("id", count="exact")
        .eq("session_id", session_id)
        .in_("status", ["present", "present_manual"])
        .execute()
    ).count or 0
    supabase.table("attendance_sessions").update({"present_count": present_count}).eq(
        "id", session_id
    ).execute()

    return {**record, "name": student["name"]}


@router.post("/{session_id}/end", response_model=SessionDetail)
def end_session(session_id: str, teacher_id: str = Depends(get_current_teacher_id)):
    session_res = (
        supabase.table("attendance_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    session = session_res.data[0]

    roster = (
        supabase.table("students")
        .select("*")
        .eq("teacher_id", teacher_id)
        .eq("year", session["year"])
        .order("roll_no")
        .execute()
    ).data

    present_records = (
        supabase.table("attendance_records")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    ).data
    present_student_ids = {r["student_id"] for r in present_records}

    absentees = [s for s in roster if s["id"] not in present_student_ids]
    if absentees:
        absent_rows = [
            {
                "session_id": session_id,
                "student_id": s["id"],
                "roll_no": s["roll_no"],
                "status": "absent",
                "matched_on": None,
                "scanned_at": None,
            }
            for s in absentees
        ]
        supabase.table("attendance_records").insert(absent_rows).execute()

    present_count = len(present_student_ids)
    supabase.table("attendance_sessions").update(
        {"end_time": datetime.utcnow().isoformat(), "present_count": present_count}
    ).eq("id", session_id).execute()

    return _session_detail(session_id, teacher_id)


def _session_detail(session_id: str, teacher_id: str) -> dict:
    session = (
        supabase.table("attendance_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("teacher_id", teacher_id)
        .execute()
    ).data[0]

    records = (
        supabase.table("attendance_records")
        .select("*, students(name)")
        .eq("session_id", session_id)
        .order("roll_no")
        .execute()
    ).data

    out_records = [
        {
            "id": r["id"],
            "student_id": r["student_id"],
            "roll_no": r["roll_no"],
            "name": (r.get("students") or {}).get("name") if r.get("students") else None,
            "status": r["status"],
            "matched_on": r.get("matched_on"),
            "scanned_at": r.get("scanned_at"),
        }
        for r in records
    ]

    return {**session, "records": out_records}


@router.get("", response_model=list[SessionOut])
def list_sessions(teacher_id: str = Depends(get_current_teacher_id)):
    result = (
        supabase.table("attendance_sessions")
        .select("*")
        .eq("teacher_id", teacher_id)
        .order("start_time", desc=True)
        .execute()
    )
    return result.data


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(session_id: str, teacher_id: str = Depends(get_current_teacher_id)):
    session_res = (
        supabase.table("attendance_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    return _session_detail(session_id, teacher_id)


@router.delete("/{session_id}")
def delete_session(session_id: str, teacher_id: str = Depends(get_current_teacher_id)):
    existing = (
        supabase.table("attendance_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    supabase.table("attendance_sessions").delete().eq("id", session_id).eq(
        "teacher_id", teacher_id
    ).execute()
    return {"deleted": True}

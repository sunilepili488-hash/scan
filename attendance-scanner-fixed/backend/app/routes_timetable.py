from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from .db import supabase
from .auth import get_current_teacher_id
from .schemas import TimetableCreate, TimetableUpdate, TimetableOut

router = APIRouter(prefix="/api/timetable", tags=["timetable"])


@router.get("", response_model=list[TimetableOut])
def list_timetable(teacher_id: str = Depends(get_current_teacher_id)):
    result = (
        supabase.table("timetable")
        .select("*")
        .eq("teacher_id", teacher_id)
        .order("day_of_week")
        .order("start_time")
        .execute()
    )
    return result.data


@router.get("/today", response_model=list[TimetableOut])
def today_lectures(teacher_id: str = Depends(get_current_teacher_id)):
    """Returns today's scheduled lectures, ordered by start time.
    Frontend highlights whichever one is currently in its time window."""
    today_name = datetime.now().strftime("%A")  # 'Monday', 'Tuesday', ...
    result = (
        supabase.table("timetable")
        .select("*")
        .eq("teacher_id", teacher_id)
        .eq("day_of_week", today_name)
        .order("start_time")
        .execute()
    )
    return result.data


@router.post("", response_model=TimetableOut)
def create_entry(payload: TimetableCreate, teacher_id: str = Depends(get_current_teacher_id)):
    row = payload.model_dump()
    row["teacher_id"] = teacher_id
    result = supabase.table("timetable").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save entry. Please try again.")
    return result.data[0]


@router.patch("/{entry_id}", response_model=TimetableOut)
def update_entry(
    entry_id: str,
    payload: TimetableUpdate,
    teacher_id: str = Depends(get_current_teacher_id),
):
    existing = (
        supabase.table("timetable")
        .select("id")
        .eq("id", entry_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Timetable entry not found.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    result = (
        supabase.table("timetable")
        .update(updates)
        .eq("id", entry_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{entry_id}")
def delete_entry(entry_id: str, teacher_id: str = Depends(get_current_teacher_id)):
    existing = (
        supabase.table("timetable")
        .select("id")
        .eq("id", entry_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Timetable entry not found.")

    supabase.table("timetable").delete().eq("id", entry_id).eq("teacher_id", teacher_id).execute()
    return {"deleted": True}

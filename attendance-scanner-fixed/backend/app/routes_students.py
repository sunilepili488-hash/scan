from fastapi import APIRouter, Depends, HTTPException, Query

from .db import supabase
from .auth import get_current_teacher_id
from .schemas import StudentCreate, StudentUpdate, StudentOut

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("", response_model=list[StudentOut])
def list_students(
    year: str | None = Query(default=None),
    teacher_id: str = Depends(get_current_teacher_id),
):
    q = supabase.table("students").select("*").eq("teacher_id", teacher_id)
    if year:
        q = q.eq("year", year)
    result = q.order("roll_no").execute()
    return result.data


@router.post("", response_model=StudentOut)
def create_student(payload: StudentCreate, teacher_id: str = Depends(get_current_teacher_id)):
    row = payload.model_dump()
    row["teacher_id"] = teacher_id
    result = supabase.table("students").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not add student. Please try again.")
    return result.data[0]


@router.patch("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: str,
    payload: StudentUpdate,
    teacher_id: str = Depends(get_current_teacher_id),
):
    existing = (
        supabase.table("students")
        .select("id")
        .eq("id", student_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Student not found.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    result = (
        supabase.table("students")
        .update(updates)
        .eq("id", student_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{student_id}")
def delete_student(student_id: str, teacher_id: str = Depends(get_current_teacher_id)):
    existing = (
        supabase.table("students")
        .select("id")
        .eq("id", student_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Student not found.")

    supabase.table("students").delete().eq("id", student_id).eq("teacher_id", teacher_id).execute()
    return {"deleted": True}

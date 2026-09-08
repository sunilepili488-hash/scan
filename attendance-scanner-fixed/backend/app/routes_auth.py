from fastapi import APIRouter, HTTPException, Depends

from .db import supabase
from .auth import hash_password, verify_password, create_access_token, get_current_teacher_id
from .schemas import TeacherRegister, TeacherLogin, AuthResponse, TeacherOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: TeacherRegister):
    existing = supabase.table("teachers").select("id").eq("email", payload.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    row = {
        "name": payload.name,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "college_name": payload.college_name,
    }
    result = supabase.table("teachers").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not create account. Please try again.")

    teacher = result.data[0]
    token = create_access_token(teacher["id"], teacher["email"])
    return AuthResponse(
        access_token=token,
        teacher=TeacherOut(
            id=teacher["id"],
            name=teacher["name"],
            email=teacher["email"],
            college_name=teacher.get("college_name"),
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: TeacherLogin):
    result = supabase.table("teachers").select("*").eq("email", payload.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    teacher = result.data[0]
    if not verify_password(payload.password, teacher["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = create_access_token(teacher["id"], teacher["email"])
    return AuthResponse(
        access_token=token,
        teacher=TeacherOut(
            id=teacher["id"],
            name=teacher["name"],
            email=teacher["email"],
            college_name=teacher.get("college_name"),
        ),
    )


@router.get("/me", response_model=TeacherOut)
def me(teacher_id: str = Depends(get_current_teacher_id)):
    result = supabase.table("teachers").select("*").eq("id", teacher_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Account not found.")
    teacher = result.data[0]
    return TeacherOut(
        id=teacher["id"],
        name=teacher["name"],
        email=teacher["email"],
        college_name=teacher.get("college_name"),
    )

from pydantic import BaseModel, EmailStr, Field


class TeacherRegister(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    college_name: str | None = None


class TeacherLogin(BaseModel):
    email: EmailStr
    password: str


class TeacherOut(BaseModel):
    id: str
    name: str
    email: str
    college_name: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    teacher: TeacherOut


# ---- Students ----

class StudentCreate(BaseModel):
    name: str = Field(min_length=1)
    roll_no: str = Field(min_length=1)
    id_no: str | None = None
    year: str = Field(min_length=1)
    photo_url: str | None = None


class StudentUpdate(BaseModel):
    name: str | None = None
    roll_no: str | None = None
    id_no: str | None = None
    year: str | None = None
    photo_url: str | None = None


class StudentOut(BaseModel):
    id: str
    name: str
    roll_no: str
    id_no: str | None = None
    year: str
    photo_url: str | None = None


# ---- Timetable ----

class TimetableCreate(BaseModel):
    year: str = Field(min_length=1)
    course: str = Field(min_length=1)
    day_of_week: str = Field(min_length=1)
    start_time: str  # "HH:MM"
    end_time: str


class TimetableUpdate(BaseModel):
    year: str | None = None
    course: str | None = None
    day_of_week: str | None = None
    start_time: str | None = None
    end_time: str | None = None


class TimetableOut(BaseModel):
    id: str
    year: str
    course: str
    day_of_week: str
    start_time: str
    end_time: str


# ---- Scan (OCR extraction, Part 2 — matching happens in Part 3) ----

class ScanExtractResult(BaseModel):
    roll_no: str | None = None
    id_no: str | None = None
    name: str | None = None
    raw_text: str
    readable: bool


# ---- Attendance sessions (Part 3) ----

class SessionStart(BaseModel):
    year: str = Field(min_length=1)
    course: str = Field(min_length=1)


class SessionOut(BaseModel):
    id: str
    teacher_id: str
    year: str
    course: str
    session_date: str
    start_time: str
    end_time: str | None = None
    total_students: int | None = None
    present_count: int | None = None


class AttendanceRecordOut(BaseModel):
    id: str
    student_id: str | None = None
    roll_no: str
    name: str | None = None
    status: str
    matched_on: str | None = None
    scanned_at: str | None = None


class SessionDetail(SessionOut):
    records: list[AttendanceRecordOut]


class ScanMatchResult(BaseModel):
    status: str  # 'matched' | 'already_marked' | 'no_match' | 'not_scanned'
    student_name: str | None = None
    student_roll_no: str | None = None
    matched_on: str | None = None
    scanned_count: int


class ManualPresentRequest(BaseModel):
    student_id: str = Field(min_length=1)

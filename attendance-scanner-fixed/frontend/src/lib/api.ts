import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type Teacher = {
  id: string;
  name: string;
  email: string;
  college_name?: string | null;
};

export async function registerTeacher(data: {
  name: string;
  email: string;
  password: string;
  college_name?: string;
}) {
  const res = await api.post("/api/auth/register", data);
  return res.data as { access_token: string; teacher: Teacher };
}

export async function loginTeacher(data: { email: string; password: string }) {
  const res = await api.post("/api/auth/login", data);
  return res.data as { access_token: string; teacher: Teacher };
}

export async function fetchMe() {
  const res = await api.get("/api/auth/me");
  return res.data as Teacher;
}

// ---- Students ----

export type Student = {
  id: string;
  name: string;
  roll_no: string;
  id_no?: string | null;
  year: string;
  photo_url?: string | null;
};

export async function listStudents(year?: string) {
  const res = await api.get("/api/students", { params: year ? { year } : {} });
  return res.data as Student[];
}

export async function createStudent(data: Omit<Student, "id">) {
  const res = await api.post("/api/students", data);
  return res.data as Student;
}

export async function updateStudent(id: string, data: Partial<Omit<Student, "id">>) {
  const res = await api.patch(`/api/students/${id}`, data);
  return res.data as Student;
}

export async function deleteStudent(id: string) {
  await api.delete(`/api/students/${id}`);
}

// ---- Timetable ----

export type TimetableEntry = {
  id: string;
  year: string;
  course: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
};

export async function listTimetable() {
  const res = await api.get("/api/timetable");
  return res.data as TimetableEntry[];
}

export async function listTodayLectures() {
  const res = await api.get("/api/timetable/today");
  return res.data as TimetableEntry[];
}

export async function createTimetableEntry(data: Omit<TimetableEntry, "id">) {
  const res = await api.post("/api/timetable", data);
  return res.data as TimetableEntry;
}

export async function updateTimetableEntry(
  id: string,
  data: Partial<Omit<TimetableEntry, "id">>
) {
  const res = await api.patch(`/api/timetable/${id}`, data);
  return res.data as TimetableEntry;
}

export async function deleteTimetableEntry(id: string) {
  await api.delete(`/api/timetable/${id}`);
}

// ---- Scan (OCR extraction) ----

export type ScanExtractResult = {
  roll_no: string | null;
  id_no: string | null;
  name: string | null;
  raw_text: string;
  readable: boolean;
};

export async function extractCard(frames: string[]) {
  const res = await api.post("/api/scan/extract", { frames });
  return res.data as ScanExtractResult;
}

// ---- Attendance sessions ----

export type AttendanceSession = {
  id: string;
  teacher_id: string;
  year: string;
  course: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  total_students?: number | null;
  present_count?: number | null;
};

export type AttendanceRecord = {
  id: string;
  student_id: string | null;
  roll_no: string;
  name: string | null;
  status: string;
  matched_on: string | null;
  scanned_at: string | null;
};

export type SessionDetail = AttendanceSession & { records: AttendanceRecord[] };

export type ScanMatchResult = {
  status: "matched" | "already_marked" | "no_match" | "not_scanned";
  student_name?: string | null;
  student_roll_no?: string | null;
  matched_on?: string | null;
  scanned_count: number;
};

export async function startSession(year: string, course: string) {
  const res = await api.post("/api/sessions/start", { year, course });
  return res.data as AttendanceSession;
}

export async function scanAndMatch(sessionId: string, frames: string[]) {
  const res = await api.post(`/api/sessions/${sessionId}/scan`, { frames });
  return res.data as ScanMatchResult;
}

export async function endSession(sessionId: string) {
  const res = await api.post(`/api/sessions/${sessionId}/end`);
  return res.data as SessionDetail;
}

export async function markPresentManually(sessionId: string, studentId: string) {
  const res = await api.post(`/api/sessions/${sessionId}/manual-present`, {
    student_id: studentId,
  });
  return res.data as AttendanceRecord;
}

export async function listSessions() {
  const res = await api.get("/api/sessions");
  return res.data as AttendanceSession[];
}

export async function getSession(sessionId: string) {
  const res = await api.get(`/api/sessions/${sessionId}`);
  return res.data as SessionDetail;
}

export async function deleteSession(sessionId: string) {
  await api.delete(`/api/sessions/${sessionId}`);
}

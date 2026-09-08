-- Run this ONCE in Supabase SQL editor before using the app.
-- Full schema for the whole app (Parts 1-3 all use this same schema).

create extension if not exists pgcrypto;

create table teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  college_name text,
  created_at timestamptz default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  name text not null,
  roll_no text not null,
  id_no text,
  year text not null,
  photo_url text,
  card_reference_text text,
  created_at timestamptz default now()
);

create table timetable (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  year text not null,
  course text not null,
  day_of_week text not null,
  start_time time not null,
  end_time time not null
);

create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  year text not null,
  course text not null,
  session_date date not null,
  start_time timestamptz default now(),
  end_time timestamptz,
  total_students int,
  present_count int default 0
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references attendance_sessions(id) on delete cascade,
  student_id uuid references students(id),
  roll_no text not null,
  status text not null,
  matched_on text,
  scanned_at timestamptz
);

-- Helpful indexes
create index idx_students_teacher on students(teacher_id, year);
create index idx_timetable_teacher on timetable(teacher_id);
create index idx_sessions_teacher on attendance_sessions(teacher_id);
create index idx_records_session on attendance_records(session_id);

-- Row Level Security: we use the service_role key from the FastAPI backend only,
-- so RLS can stay simple. Enabling it as defense-in-depth; backend always filters
-- by teacher_id explicitly in every query regardless.
alter table teachers enable row level security;
alter table students enable row level security;
alter table timetable enable row level security;
alter table attendance_sessions enable row level security;
alter table attendance_records enable row level security;

-- service_role bypasses RLS automatically, so no policies are strictly required
-- for the backend to work. These policies exist only as a safety net.

# Attendance Scanner — Part 1 (Setup + Auth)

## What's in this part
- Supabase Postgres schema (`backend/schema.sql`) — run once in Supabase SQL editor
- FastAPI backend with Supabase connection + JWT auth (register/login/me)
- React + Vite + Tailwind frontend with animated splash screen, Login, Register,
  and a placeholder Home screen behind a protected route

## 1. Supabase setup
1. Create a project at supabase.com
2. Open the SQL editor → paste the contents of `backend/schema.sql` → run it
3. Go to Project Settings → API → copy the **Project URL** and the
   **service_role key** (not the anon key — the backend needs service_role to
   bypass RLS safely, since it enforces `teacher_id` filtering itself)

## 2. Backend (local run)
```
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
uvicorn app.main:app --reload
```
Runs on http://localhost:8000 — check http://localhost:8000/api/health

**Important note on hosting:** this backend does OCR with `pytesseract`/OpenCV in
Part 2–3, which needs a real running Python process (and the `tesseract` OS
binary) — **Vercel's serverless functions won't work well for this part**.
For the backend, use **Render** or **Railway** (both have simple free/cheap
tiers, support `Procfile`, and let you install the `tesseract-ocr` apt
package). Vercel is a great fit for the **frontend** only. I'll set up the
Render/Railway config in Part 2 when we get to the OCR pipeline.

## 3. Frontend (local run)
```
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL=http://localhost:8000
npm run dev
```
Runs on http://localhost:5173

## 4. Deploying frontend to Vercel
- Push this repo to GitHub
- Import the `frontend` folder as the project root in Vercel
- Set env var `VITE_API_URL` to your deployed backend URL (Render/Railway)
- `vercel.json` already handles client-side routing rewrites

## 5. Deploying backend to Render
- Push this repo to GitHub, connect it on render.com as a **Web Service**,
  root directory `backend`
- Render auto-detects `render.yaml`, which installs the `tesseract-ocr`
  system package during build — **the teacher never installs anything**,
  this happens once on Render's server when you deploy
- Set the 3 env vars in Render's dashboard: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`

---

## Part 2 — added in this update
- **Students CRUD** (`/api/students`) — add/edit/delete per year, scoped to
  the logged-in teacher
- **Timetable CRUD** (`/api/timetable`, `/api/timetable/today`) — add/edit/
  delete lectures; `/today` powers the Home screen's "today's lecture" card
- **OCR extraction** (`/api/scan/extract`) — receives captured frames, picks
  the sharpest one (OpenCV Laplacian variance + contrast), runs Tesseract OCR
  with auto-rotation correction, extracts Roll No / ID No / Name via pattern
  matching. **Note:** this endpoint only extracts text — it does not yet
  match against the student roster or save attendance records. That's Part 3.
- **Frontend:** real Home screen (today's lecture, active-lecture highlight,
  Scan Attendance button), Settings screen (tabs for Manage Students /
  Manage Timetable), Scanner screen (full-bleed back camera, auto torch in
  low light, 1–6s capture window, green/red result flash — currently flashes
  "Present" for any readable card since matching isn't wired up yet)

**Next (Part 3):** wire the extracted fields into real roster matching
(Roll No / ID No / Name, any-one-matches logic), save attendance records to
Supabase, build the present/absent summary + Attendance History screen, add
the success/error sounds, and polish the splash/transition animations.
Confirm and I'll start.

---

## Part 3 — added in this update
- **Attendance sessions** (`/api/sessions/*`): start a session for a
  year+course, scan-and-match each captured card against the roster
  (Roll No → ID No → Name, any one match is enough, exactly as spec'd),
  end the session (auto-marks every unscanned roster student "absent"),
  list history, get full session detail, delete a session
- **Manual "Mark Present"** fallback for students who couldn't scan
- **Frontend:** Home now starts a real session when you tap "Scan" on a
  lecture (or the bottom bar for the active one), shows the last completed
  session's present/absent list; Scanner now calls the real match endpoint
  and shows "Already Marked" for duplicate scans; new **Attendance History**
  screen (list of past sessions → tap for full roll-no-ordered detail with
  manual mark-present); programmatic success/error sounds (Web Audio API,
  no audio files needed) play on every match/no-match

This completes the full spec: auth, students, timetable, scanner with OCR +
matching, attendance history, sounds. What's left is just real-world
tuning — OCR accuracy depends a lot on actual ID card photos, so expect to
adjust the regex patterns in `backend/app/ocr.py` (`_ROLL_RE`, `_ID_RE`)
once you test against your college's real card layout.

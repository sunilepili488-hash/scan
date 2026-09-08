import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes_auth import router as auth_router
from .routes_students import router as students_router
from .routes_timetable import router as timetable_router
from .routes_scan import router as scan_router
from .routes_sessions import router as sessions_router

app = FastAPI(title="Attendance Scanner API")

# Allow the Vercel-hosted frontend (and local dev) to call this API.
# Set ALLOWED_ORIGINS as a comma-separated env var in Render, e.g.
# "https://your-app.vercel.app,http://localhost:5173". Falls back to "*"
# only when the env var isn't set, so local dev keeps working out of the box.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in _allowed_origins.split(",")] if _allowed_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(students_router)
app.include_router(timetable_router)
app.include_router(scan_router)
app.include_router(sessions_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}

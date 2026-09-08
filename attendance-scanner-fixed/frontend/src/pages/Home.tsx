import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  listTodayLectures,
  TimetableEntry,
  startSession,
  listSessions,
  getSession,
  SessionDetail,
} from "../lib/api";

function isActive(entry: TimetableEntry): boolean {
  const now = new Date();
  const [sh, sm] = entry.start_time.split(":").map(Number);
  const [eh, em] = entry.end_time.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em, 0, 0);
  return now >= start && now <= end;
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export default function Home() {
  const { teacher, logout } = useAuth();
  const navigate = useNavigate();
  const [lectures, setLectures] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [lastSession, setLastSession] = useState<SessionDetail | null>(null);

  useEffect(() => {
    listTodayLectures()
      .then(setLectures)
      .finally(() => setLoading(false));

    listSessions().then(async (sessions) => {
      const today = new Date().toISOString().slice(0, 10);
      const todaysEnded = sessions.find((s) => s.session_date === today && s.end_time);
      if (todaysEnded) {
        const detail = await getSession(todaysEnded.id);
        setLastSession(detail);
      }
    });
  }, []);

  async function handleScan(entry: TimetableEntry) {
    setStarting(entry.id);
    try {
      const session = await startSession(entry.year, entry.course);
      navigate(`/scan/${session.id}`);
    } finally {
      setStarting(null);
    }
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const activeLecture = lectures.find(isActive);

  return (
    <div className="min-h-screen bg-cream pb-28">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-indigo">
              Hi, {teacher?.name?.split(" ")[0]}
            </h1>
            <p className="text-sm text-indigo/60">{teacher?.college_name}</p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/history"
              aria-label="Attendance History"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo/15 text-indigo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 3 3 5-6" />
              </svg>
            </Link>
            <Link
              to="/settings"
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo/15 text-indigo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs font-medium uppercase tracking-wide text-indigo/40">
          Today · {today}
        </p>

        <div className="mt-3 space-y-3">
          {loading && <p className="text-sm text-indigo/50">Loading today's schedule…</p>}

          {!loading && lectures.length === 0 && (
            <div className="rounded-xl border border-dashed border-indigo/20 p-6 text-center text-sm text-indigo/50">
              No lectures scheduled for today. Add your timetable in Settings.
            </div>
          )}

          {lectures.map((entry) => {
            const active = isActive(entry);
            return (
              <div
                key={entry.id}
                className={`rounded-xl p-4 transition ${
                  active
                    ? "bg-indigo text-cream shadow-lg shadow-indigo/20"
                    : "bg-white text-indigo border border-indigo/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${active ? "text-amber" : "text-indigo/50"}`}>
                      {entry.year} · {active ? "Active now" : "Scheduled"}
                    </p>
                    <p className="mt-1 font-display text-lg font-semibold">{entry.course}</p>
                    <p className={`text-sm ${active ? "text-cream/70" : "text-indigo/60"}`}>
                      {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleScan(entry)}
                    disabled={starting === entry.id}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      active ? "bg-amber text-indigo" : "border border-indigo/20 text-indigo"
                    }`}
                  >
                    {starting === entry.id ? "Starting…" : "Scan"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {lastSession && (
          <div className="mt-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo/40">
              Last session · {lastSession.course}
            </p>
            <div className="rounded-xl border border-indigo/10 bg-white p-4">
              <p className="text-sm text-indigo">
                {lastSession.present_count} / {lastSession.total_students} present
              </p>
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                {lastSession.records.map((r) => (
                  <div key={r.id} className="flex justify-between border-b border-indigo/5 py-1">
                    <span className="text-indigo/70">
                      Roll No. {r.roll_no} {r.name ? `— ${r.name}` : ""}
                    </span>
                    <span
                      className={
                        r.status === "absent" ? "text-danger" : "text-success"
                      }
                    >
                      {r.status === "absent" ? "Absent" : "Present"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="mt-8 text-sm text-indigo/40 underline underline-offset-2"
        >
          Log out
        </button>
      </div>

      {activeLecture && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-indigo/10 bg-cream/95 px-4 pb-6 pt-4 backdrop-blur">
          <button
            onClick={() => handleScan(activeLecture)}
            disabled={starting === activeLecture.id}
            className="mx-auto block w-full max-w-md rounded-2xl bg-amber py-4 text-center font-display text-base font-semibold text-indigo shadow-lg shadow-amber/30"
          >
            {starting === activeLecture.id ? "Starting…" : "Scan Attendance"}
          </button>
        </div>
      )}
    </div>
  );
}

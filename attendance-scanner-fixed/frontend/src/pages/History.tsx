import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AttendanceSession,
  SessionDetail,
  listSessions,
  getSession,
  deleteSession,
  markPresentManually,
} from "../lib/api";

export default function History() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSession, setOpenSession] = useState<SessionDetail | null>(null);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  async function openDetail(id: string) {
    const detail = await getSession(id);
    setOpenSession(detail);
  }

  async function handleDelete(id: string) {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (openSession?.id === id) setOpenSession(null);
  }

  async function handleManualPresent(studentId: string | null) {
    if (!openSession || !studentId) return;
    await markPresentManually(openSession.id, studentId);
    const refreshed = await getSession(openSession.id);
    setOpenSession(refreshed);
  }

  if (openSession) {
    return (
      <div className="min-h-screen bg-cream px-4 py-6">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => setOpenSession(null)}
            className="mb-4 flex items-center gap-2 text-sm text-indigo/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to history
          </button>

          <h1 className="font-display text-xl font-bold text-indigo">{openSession.course}</h1>
          <p className="text-sm text-indigo/50">
            {openSession.year} Year · {openSession.session_date}
          </p>
          <p className="mt-1 text-sm font-medium text-indigo">
            {openSession.present_count} / {openSession.total_students} present
          </p>

          <div className="mt-4 space-y-1">
            {openSession.records.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-indigo/10 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm text-indigo">
                    Roll No. {r.roll_no} {r.name ? `— ${r.name}` : ""}
                  </p>
                  <p className="text-xs text-indigo/40">
                    {r.status === "present_manual" ? "Marked manually" : r.matched_on ? `Matched via ${r.matched_on}` : ""}
                  </p>
                </div>
                {r.status === "absent" ? (
                  <button
                    onClick={() => handleManualPresent(r.student_id)}
                    className="rounded-lg border border-indigo/20 px-3 py-1.5 text-xs font-medium text-indigo"
                  >
                    Mark Present
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-success">Present</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/" aria-label="Back" className="text-indigo/60">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="font-display text-xl font-bold text-indigo">Attendance History</h1>
        </div>

        {loading ? (
          <p className="text-sm text-indigo/50">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-indigo/50">No attendance sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-indigo/10 bg-white px-4 py-3"
              >
                <button onClick={() => openDetail(s.id)} className="flex-1 text-left">
                  <p className="text-sm font-medium text-indigo">
                    {s.course} · {s.year} Year
                  </p>
                  <p className="text-xs text-indigo/50">
                    {s.session_date} · {s.present_count ?? 0}/{s.total_students ?? 0} present
                  </p>
                </button>
                <button onClick={() => handleDelete(s.id)} className="text-xs font-medium text-danger">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

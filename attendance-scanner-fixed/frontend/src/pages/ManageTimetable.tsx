import { useEffect, useState } from "react";
import {
  TimetableEntry,
  listTimetable,
  createTimetableEntry,
  deleteTimetableEntry,
} from "../lib/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const YEARS = ["1st", "2nd", "3rd"];

export default function ManageTimetable() {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    year: "1st",
    course: "",
    day_of_week: "Monday",
    start_time: "09:00",
    end_time: "10:00",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    listTimetable()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await createTimetableEntry(form);
      setEntries((prev) => [...prev, created]);
      setForm({ ...form, course: "" });
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not save entry.");
    }
  }

  async function handleDelete(id: string) {
    await deleteTimetableEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-indigo/10 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-indigo">Add a lecture</p>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            className="rounded-lg border border-indigo/15 px-3 py-2 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y} Year
              </option>
            ))}
          </select>
          <select
            value={form.day_of_week}
            onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
            className="rounded-lg border border-indigo/15 px-3 py-2 text-sm"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Course (e.g. Python)"
            value={form.course}
            onChange={(e) => setForm({ ...form, course: e.target.value })}
            className="col-span-2 rounded-lg border border-indigo/15 px-3 py-2 text-sm outline-none focus:border-amber"
          />
          <div>
            <label className="mb-1 block text-xs text-indigo/50">Start</label>
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="w-full rounded-lg border border-indigo/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-indigo/50">End</label>
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="w-full rounded-lg border border-indigo/15 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <button
          type="submit"
          className="mt-3 rounded-lg bg-indigo px-4 py-2 text-sm font-medium text-cream"
        >
          Add to timetable
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-indigo/50">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-indigo/50">No timetable entries yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-indigo/10 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-indigo">
                  {e.course} · {e.year} Year
                </p>
                <p className="text-xs text-indigo/50">
                  {e.day_of_week}, {e.start_time}–{e.end_time}
                </p>
              </div>
              <button onClick={() => handleDelete(e.id)} className="text-xs font-medium text-danger">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

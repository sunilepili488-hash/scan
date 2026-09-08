import { useEffect, useState } from "react";
import {
  Student,
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
} from "../lib/api";

const YEARS = ["1st", "2nd", "3rd"];

export default function ManageStudents() {
  const [year, setYear] = useState("1st");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", roll_no: "", id_no: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load(y: string) {
    setLoading(true);
    listStudents(y)
      .then(setStudents)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(year);
  }, [year]);

  function resetForm() {
    setForm({ name: "", roll_no: "", id_no: "" });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        const updated = await updateStudent(editingId, form);
        setStudents((prev) =>
          prev.map((s) => (s.id === editingId ? updated : s)).sort((a, b) => a.roll_no.localeCompare(b.roll_no))
        );
      } else {
        const created = await createStudent({ ...form, year });
        setStudents((prev) => [...prev, created].sort((a, b) => a.roll_no.localeCompare(b.roll_no)));
      }
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not save student.");
    }
  }

  function startEdit(s: Student) {
    setEditingId(s.id);
    setForm({ name: s.name, roll_no: s.roll_no, id_no: s.id_no || "" });
  }

  async function handleDelete(id: string) {
    await deleteStudent(id);
    setStudents((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) resetForm();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {YEARS.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              year === y ? "bg-indigo text-cream" : "bg-white text-indigo/60 border border-indigo/15"
            }`}
          >
            {y} Year
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-indigo/10 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-indigo">
          {editingId ? "Edit student" : "Add student"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded-lg border border-indigo/15 px-3 py-2 text-sm outline-none focus:border-amber"
          />
          <input
            required
            placeholder="Roll No"
            value={form.roll_no}
            onChange={(e) => setForm({ ...form, roll_no: e.target.value })}
            className="rounded-lg border border-indigo/15 px-3 py-2 text-sm outline-none focus:border-amber"
          />
          <input
            placeholder="ID No (optional)"
            value={form.id_no}
            onChange={(e) => setForm({ ...form, id_no: e.target.value })}
            className="rounded-lg border border-indigo/15 px-3 py-2 text-sm outline-none focus:border-amber"
          />
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-indigo px-4 py-2 text-sm font-medium text-cream"
          >
            {editingId ? "Save changes" : "Add student"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-indigo/15 px-4 py-2 text-sm text-indigo/60"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-indigo/50">Loading…</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-indigo/50">No students added for {year} year yet.</p>
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-indigo/10 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-indigo">{s.name}</p>
                <p className="text-xs text-indigo/50">
                  Roll {s.roll_no}
                  {s.id_no ? ` · ID ${s.id_no}` : ""}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => startEdit(s)} className="text-xs font-medium text-indigo/60">
                  Edit
                </button>
                <button onClick={() => handleDelete(s.id)} className="text-xs font-medium text-danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

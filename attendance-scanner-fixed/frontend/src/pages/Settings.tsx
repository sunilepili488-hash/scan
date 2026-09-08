import { useState } from "react";
import { Link } from "react-router-dom";
import ManageStudents from "./ManageStudents";
import ManageTimetable from "./ManageTimetable";

export default function Settings() {
  const [tab, setTab] = useState<"students" | "timetable">("students");

  return (
    <div className="min-h-screen bg-cream px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/" aria-label="Back" className="text-indigo/60">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="font-display text-xl font-bold text-indigo">Settings</h1>
        </div>

        <div className="mb-6 flex rounded-lg border border-indigo/10 bg-white p-1">
          <button
            onClick={() => setTab("students")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === "students" ? "bg-indigo text-cream" : "text-indigo/60"
            }`}
          >
            Manage Students
          </button>
          <button
            onClick={() => setTab("timetable")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === "timetable" ? "bg-indigo text-cream" : "text-indigo/60"
            }`}
          >
            Manage Timetable
          </button>
        </div>

        {tab === "students" ? <ManageStudents /> : <ManageTimetable />}
      </div>
    </div>
  );
}

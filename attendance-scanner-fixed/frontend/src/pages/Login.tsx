import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginTeacher } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await loginTeacher({ email, password });
      login(res.access_token, res.teacher);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-indigo mb-1">Welcome back</h1>
        <p className="text-sm text-indigo/60 mb-8">Log in to take today's attendance</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-indigo/80 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-indigo/15 bg-white px-4 py-3 text-indigo outline-none focus:border-amber focus:ring-2 focus:ring-amber/30"
              placeholder="you@college.edu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-indigo/80 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-indigo/15 bg-white px-4 py-3 text-indigo outline-none focus:border-amber focus:ring-2 focus:ring-amber/30"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo py-3 font-display font-semibold text-cream transition hover:bg-indigo-deep disabled:opacity-60"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-indigo/60">
          New here?{" "}
          <Link to="/register" className="font-medium text-indigo underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

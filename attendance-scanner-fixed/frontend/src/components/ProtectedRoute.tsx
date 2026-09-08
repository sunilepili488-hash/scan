import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { teacher, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-indigo/50">
        Loading…
      </div>
    );
  }

  if (!teacher) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

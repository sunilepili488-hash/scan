import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Teacher, fetchMe } from "./api";

type AuthContextType = {
  teacher: Teacher | null;
  loading: boolean;
  login: (token: string, teacher: Teacher) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setTeacher)
      .catch(() => {
        localStorage.removeItem("access_token");
      })
      .finally(() => setLoading(false));
  }, []);

  function login(token: string, teacher: Teacher) {
    localStorage.setItem("access_token", token);
    setTeacher(teacher);
  }

  function logout() {
    localStorage.removeItem("access_token");
    setTeacher(null);
  }

  return (
    <AuthContext.Provider value={{ teacher, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

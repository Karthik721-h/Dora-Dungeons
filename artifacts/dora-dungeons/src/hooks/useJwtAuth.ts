import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "dd_jwt";
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface UseJwtAuth extends AuthState {
  signup: (email: string, password: string, firstName?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authHeader: () => Record<string, string>;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.message ?? "Request failed"), { status: res.status, data });
  }
  return data;
}

export function useJwtAuth(): UseJwtAuth {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
      return;
    }
    apiFetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(({ user }) => {
        setState({ user, token, isLoading: false, isAuthenticated: true });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
      });
  }, []);

  const signup = useCallback(async (email: string, password: string, firstName?: string) => {
    const data = await apiFetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    setState({ user: data.user, token: data.token, isLoading: false, isAuthenticated: true });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    setState({ user: data.user, token: data.token, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  const authHeader = useCallback((): Record<string, string> => {
    const token = state.token ?? localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [state.token]);

  return { ...state, signup, login, logout, authHeader };
}

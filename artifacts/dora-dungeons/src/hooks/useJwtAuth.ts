import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/lib/config";

const TOKEN_KEY = "dd_jwt";

// Always use the absolute backend URL so auth calls work in Capacitor (no proxy)
// and in all web contexts.
const BASE = API_BASE_URL;

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
  signup: (email: string, firstName?: string) => Promise<void>;
  login: (email: string) => Promise<void>;
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

/**
 * Optimistic JWT auth hook.
 *
 * If a token already exists in localStorage we immediately treat the user as
 * authenticated (isLoading: false, isAuthenticated: true) so the game screen
 * can begin loading in parallel with the background auth/me validation.
 *
 * If the token turns out to be invalid/expired, auth/me will fail and we
 * quietly sign the user out, returning them to the login screen.
 */
export function useJwtAuth(): UseJwtAuth {
  const existingToken = localStorage.getItem(TOKEN_KEY);

  const [state, setState] = useState<AuthState>(() => {
    // Optimistic: if a token is present, skip the loading spinner entirely.
    if (existingToken) {
      return { user: null, token: existingToken, isLoading: false, isAuthenticated: true };
    }
    return { user: null, token: null, isLoading: false, isAuthenticated: false };
  });

  // Validate the stored token in the background.  On success we fill in the
  // user object.  On failure we sign out — the game screen will unmount.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(({ user }: { user: AuthUser }) => {
        setState((prev) => ({ ...prev, user, token, isAuthenticated: true, isLoading: false }));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
      });
  }, []);

  const signup = useCallback(async (email: string, firstName?: string) => {
    const data = await apiFetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, firstName }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    setState({ user: data.user, token: data.token, isLoading: false, isAuthenticated: true });
  }, []);

  const login = useCallback(async (email: string) => {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
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

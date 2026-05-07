"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { AuthSession } from "@/lib/types";

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    apiRequest<AuthSession>("/auth/me")
      .then(setSession)
      .catch(() => setSession({ authenticated: false, visible_tabs: [] }))
      .finally(() => setAuthLoading(false));
  }, []);

  async function login(username: string, password: string): Promise<AuthSession> {
    const nextSession = await apiRequest<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setSession(nextSession);
    return nextSession;
  }

  async function logout(): Promise<void> {
    await apiRequest<AuthSession>("/auth/logout", { method: "POST" });
    setSession({ authenticated: false, visible_tabs: [] });
  }

  return { session, authLoading, login, logout };
}

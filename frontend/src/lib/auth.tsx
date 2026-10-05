import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setUnauthorizedHandler, tokens } from "./api";
import type { ClinicSettings, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(tokens.access));
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me/"),
    enabled: hasToken,
    retry: false,
    staleTime: Infinity,
  });

  const signOut = useCallback(() => {
    tokens.clear();
    setHasToken(false);
    qc.clear();
  }, [qc]);

  useEffect(() => setUnauthorizedHandler(signOut), [signOut]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await fetch("/api/auth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).catch(() => {
        throw new ApiError(0, "Can't reach the clinic server. Check that it is running.");
      });
      if (!res.ok) throw new ApiError(res.status, "That username and password don't match. Please try again.");
      const data = await res.json();
      tokens.set(data.access, data.refresh);
      setHasToken(true);
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    [qc],
  );

  const value = useMemo<AuthState>(
    () => ({
      user: hasToken ? (me.data ?? null) : null,
      loading: hasToken && me.isLoading,
      signIn,
      signOut,
    }),
    [hasToken, me.data, me.isLoading, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function useClinic() {
  return useQuery({ queryKey: ["clinic"], queryFn: () => api<ClinicSettings>("/clinic/"), staleTime: 5 * 60_000 });
}

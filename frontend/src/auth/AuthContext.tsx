import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentUser, loginRequest, logoutRequest, switchOrganizationRequest } from "../services/api";
import type { AuthUser } from "../types";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authStorage";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!getAuthToken()) {
        if (active) setLoading(false);
        return;
      }

      try {
        const response = await getCurrentUser();
        if (active) setUser(response.user);
      } catch {
        clearAuthToken();
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    function handleUnauthorized() {
      clearAuthToken();
      setUser(null);
      setLoading(false);
    }

    void restoreSession();
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      active = false;
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const response = await loginRequest(email, password);
      setAuthToken(response.token);
      setUser(response.user);
    },
    async logout() {
      try {
        if (getAuthToken()) await logoutRequest();
      } catch {
        // Logout local deve funcionar mesmo se a API estiver indisponivel.
      } finally {
        clearAuthToken();
        setUser(null);
      }
    },
    async switchOrganization(organizationId) {
      const response = await switchOrganizationRequest(organizationId);
      setAuthToken(response.token);
      setUser(response.user);
    }
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}

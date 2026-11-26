import { createContext, useContext, useCallback, useMemo, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react";

// --- Configuration ---
// In production, set VITE_ENTRA_CLIENT_ID and VITE_ENTRA_TENANT_ID.
// In development (when both are empty), auth is bypassed entirely.

const CLIENT_ID = import.meta.env.VITE_ENTRA_CLIENT_ID ?? "";
const TENANT_ID = import.meta.env.VITE_ENTRA_TENANT_ID ?? "";
const REDIRECT_URI = import.meta.env.VITE_ENTRA_REDIRECT_URI ?? window.location.origin;
const API_SCOPE = import.meta.env.VITE_ENTRA_API_SCOPE ?? `api://${CLIENT_ID}/access_as_user`;

const DEV_MODE = !CLIENT_ID;

const msalConfig = {
  auth: {
    clientId: CLIENT_ID || "00000000-0000-0000-0000-000000000000",
    authority: TENANT_ID
      ? `https://login.microsoftonline.com/${TENANT_ID}`
      : "https://login.microsoftonline.com/common",
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: REDIRECT_URI,
  },
  cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
};

const msalInstance = new PublicClientApplication(msalConfig);

// --- Auth context ---

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { name: string; email: string } | null;
  getToken: () => Promise<string>;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: DEV_MODE,
  isLoading: false,
  user: DEV_MODE ? { name: "Developer", email: "dev@localhost" } : null,
  getToken: async () => "",
  login: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

// --- Fetch wrapper that injects Authorization header ---

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  if (DEV_MODE) return fetch(url, init);
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    await msalInstance.loginRedirect({ scopes: [API_SCOPE] });
    throw new Error("Redirecting to login");
  }
  try {
    const token = await msalInstance.acquireTokenSilent({
      scopes: [API_SCOPE],
      account: accounts[0],
    });
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token.accessToken}`);
    return fetch(url, { ...init, headers });
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msalInstance.loginRedirect({ scopes: [API_SCOPE] });
    }
    throw err;
  }
}

// --- Inner provider (uses MSAL hooks) ---

function AuthInner({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [isLoading, setIsLoading] = useState(!DEV_MODE);

  useEffect(() => {
    if (DEV_MODE || isAuthenticated || inProgress !== "none") return;
    setIsLoading(false);
  }, [isAuthenticated, inProgress]);

  const user = useMemo(() => {
    if (DEV_MODE) return { name: "Developer", email: "dev@localhost" };
    const acct = accounts[0];
    if (!acct) return null;
    return { name: acct.name ?? acct.username, email: acct.username };
  }, [accounts]);

  const getToken = useCallback(async () => {
    if (DEV_MODE) return "";
    const acct = accounts[0];
    if (!acct) throw new Error("Not authenticated");
    const res = await instance.acquireTokenSilent({ scopes: [API_SCOPE], account: acct });
    return res.accessToken;
  }, [instance, accounts]);

  const login = useCallback(async () => {
    if (DEV_MODE) return;
    await instance.loginRedirect({ scopes: [API_SCOPE] });
  }, [instance]);

  const logout = useCallback(() => {
    if (DEV_MODE) return;
    instance.logoutRedirect();
  }, [instance]);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated: DEV_MODE || isAuthenticated, isLoading, user, getToken, login, logout }),
    [isAuthenticated, isLoading, user, getToken, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- Public provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  if (DEV_MODE) {
    return (
      <AuthContext.Provider
        value={{
          isAuthenticated: true,
          isLoading: false,
          user: { name: "Developer", email: "dev@localhost" },
          getToken: async () => "",
          login: async () => {},
          logout: () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }
  return (
    <MsalProvider instance={msalInstance}>
      <AuthInner>{children}</AuthInner>
    </MsalProvider>
  );
}

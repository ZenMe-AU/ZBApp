/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { InteractionRequiredAuthError, InteractionStatus, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { appScopes } from "./msalInstance";

const loginScopes = ["openid", "profile", ...appScopes];

type AuthContextValue = {
  account: AccountInfo | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function clearAuthStorage() {
  localStorage.removeItem("appToken");
  localStorage.removeItem("profileId");
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;

    let cancelled = false;
    const currentAccount = instance.getActiveAccount() ?? accounts[0] ?? null;

    if (!currentAccount) {
      clearAuthStorage();
      setAccount(null);
      setIsAuthReady(true);
      return;
    }

    instance.setActiveAccount(currentAccount);
    setAccount(currentAccount);
    localStorage.setItem("profileId", currentAccount.idTokenClaims?.oid ?? "");
    setIsAuthReady(false);
    let redirectingForToken = false;
    instance
      .acquireTokenSilent({ account: currentAccount, scopes: appScopes })
      .then((token) => {
        if (cancelled) return;
        localStorage.setItem("appToken", token.accessToken);
      })
      .catch(async (error: unknown) => {
        if (error instanceof InteractionRequiredAuthError) {
          redirectingForToken = true;
          try {
            await instance.acquireTokenRedirect({ account: currentAccount, scopes: appScopes });
            return;
          } catch (redirectError) {
            error = redirectError;
            redirectingForToken = false;
          }
        }
        console.error("Unable to acquire the Quest 5 Tier EG API token", error);
        localStorage.removeItem("appToken");
        setAccount(null);
      })
      .finally(() => {
        if (!cancelled && !redirectingForToken) setIsAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, inProgress, instance]);

  const login = async () => {
    clearAuthStorage();
    setIsAuthReady(false);
    await instance.loginRedirect({ scopes: loginScopes, prompt: "select_account" });
  };

  const logout = async () => {
    clearAuthStorage();
    await instance.logoutRedirect({ account: instance.getActiveAccount() ?? undefined });
  };

  return <AuthContext.Provider value={{ account, isAuthenticated: Boolean(account), isAuthReady, login, logout }}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children, msalInstance }: { children: ReactNode; msalInstance: IPublicClientApplication }) {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  );
}

export function useAuthState() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthState must be used within AuthProvider");
  return context;
}

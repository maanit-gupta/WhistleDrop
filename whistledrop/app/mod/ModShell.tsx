"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { NavPill } from "@/components/ui/NavPill";
import type { ApiFailure } from "@/lib/client/api";
import { clearToken, decodeSession, peekToken, subscribe, type ModeratorSession } from "@/lib/client/session";
import { ROUTES } from "@/lib/site";
import styles from "./mod.module.css";

// Client-side guard for everything under /mod except the sign-in page.
//
// - No usable token → back to /mod/login. The API client clears the token on
//   any 401, and the store subscription below sees that, so a 401 from any
//   request anywhere in /mod also lands here.
// - A 403 FORBIDDEN reported through useModFailure() swaps the page for a
//   "Not permitted" panel.
// This only decides what to show. The API authorizes every request itself.

interface ModContextValue {
  session: ModeratorSession;
  /** Pass any failed API result here; 403 FORBIDDEN shows the "Not permitted" panel. */
  reportFailure: (failure: ApiFailure) => void;
}

const ModContext = createContext<ModContextValue | null>(null);

export function useModSession(): ModContextValue {
  const value = useContext(ModContext);
  if (!value) throw new Error("useModSession must be used inside the /mod layout");
  return value;
}

/** undefined while hydrating (sessionStorage isn't readable on the server). */
const useStoredToken = () => useSyncExternalStore<string | null | undefined>(subscribe, peekToken, () => undefined);

export function ModShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useStoredToken();
  const onLoginPage = pathname === ROUTES.modLogin;
  const session = useMemo(() => (token ? decodeSession(token) : null), [token]);
  // Keyed by path, so moving to another page clears the panel.
  const [forbiddenOn, setForbiddenOn] = useState<string | null>(null);

  useEffect(() => {
    if (!onLoginPage && token === null) router.replace(ROUTES.modLogin);
  }, [onLoginPage, token, router]);

  const reportFailure = useCallback(
    (failure: ApiFailure) => {
      if (failure.status === 403 && failure.code === "FORBIDDEN") setForbiddenOn(pathname);
    },
    [pathname],
  );

  const value = useMemo(() => (session ? { session, reportFailure } : null), [session, reportFailure]);

  const signOut = () => {
    clearToken();
    router.replace(ROUTES.modLogin);
  };

  if (onLoginPage) return <>{children}</>;

  if (!session || !value) {
    return (
      <main id="main" className={`surface-dark container ${styles.page}`}>
        <HairlineShimmer rows={3} label="Checking your session" />
      </main>
    );
  }

  return (
    <ModContext.Provider value={value}>
      <NavPill variant="moderator" showAdminLink={session.role === "ADMIN"} onSignOut={signOut} />
      {forbiddenOn === pathname ? <NotPermitted /> : children}
    </ModContext.Provider>
  );
}

/** Shown for a 403, or when a non-admin opens an admin page. */
export function NotPermitted() {
  return (
    <main id="main" className={`surface-dark container ${styles.page}`}>
      <ErrorState
        title="Not permitted"
        message="Your account doesn't have access to this page. If your role changed recently, sign out and sign in again."
        action={
          <Link href={ROUTES.modDashboard} className="link-u t-nav">
            Back to the dashboard
          </Link>
        }
      />
    </main>
  );
}

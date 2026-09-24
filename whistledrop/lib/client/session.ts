import { decodeJwt } from "jose";
import type { ModeratorRole } from "@prisma/client";

// Moderator session for the browser.
//
// - The JWT lives in sessionStorage ONLY (never localStorage or cookies), so it
//   is gone when the tab closes and isn't shared with other tabs.
// - The token is decoded WITHOUT verifying its signature, purely to decide what
//   the UI shows (e.g. the ADMIN-only "Moderators" link). The server enforces
//   authorization on every request and re-reads the role from the database.
//
// React: useSyncExternalStore(subscribe, peekToken, () => null) gives a stable
// snapshot (a string), then decodeSession(token) for the claims.

const KEY = "whistledrop.moderatorToken";
const CHANGE_EVENT = "whistledrop:session";

export interface ModeratorSession {
  token: string;
  /** Moderator id (JWT `sub`). */
  id: string;
  email: string;
  /** For UI decisions only; may be stale if an admin changed it after login. */
  role: ModeratorRole;
  expiresAt: Date;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage disabled (privacy mode, sandboxed frame)
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Claims from a token, or null if it's malformed, expired, or missing a claim. */
export function decodeSession(token: string | null): ModeratorSession | null {
  if (!token) return null;
  try {
    const { sub, email, role, exp } = decodeJwt(token);
    if (typeof sub !== "string" || typeof email !== "string" || typeof exp !== "number") return null;
    if (role !== "ADMIN" && role !== "MODERATOR") return null;
    if (exp * 1000 <= Date.now()) return null;
    return { token, id: sub, email, role, expiresAt: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

/** The stored token, or null. An expired or unreadable token is removed. */
export function getToken(): string | null {
  const s = storage();
  let token: string | null = null;
  try {
    token = s?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
  if (token && !decodeSession(token)) {
    clearToken();
    return null;
  }
  return token;
}

/**
 * The stored token if it's still usable, or null. Unlike getToken() it never
 * writes to storage, so it's safe as a useSyncExternalStore snapshot (called
 * during render).
 */
export function peekToken(): string | null {
  try {
    const token = storage()?.getItem(KEY) ?? null;
    return decodeSession(token) ? token : null;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    storage()?.setItem(KEY, token);
  } finally {
    notify();
  }
}

export function clearToken(): void {
  try {
    storage()?.removeItem(KEY);
  } finally {
    notify();
  }
}

export function getSession(): ModeratorSession | null {
  return decodeSession(getToken());
}

/** Role for UI purposes only. Never use it to protect data: the server does that. */
export function getRole(): ModeratorRole | null {
  return getSession()?.role ?? null;
}

/** Calls `onChange` when the token is set or cleared in this tab. Returns an unsubscribe function. */
export function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

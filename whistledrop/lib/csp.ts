// Content-Security-Policy values, in one place.
//
// - Pages get a per-request nonce policy from proxy.ts (pagePolicy).
// - API routes and /api-docs get fixed policies from next.config.ts.
// Each path gets exactly one policy: browsers enforce every CSP header they
// receive, so a second, looser header can never relax a stricter one.
//
// No Node APIs: proxy.ts may run on the Edge runtime.

export type Directives = Record<string, string>;

export const serializeCsp = (directives: Directives) =>
  Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`.trim())
    .join("; ");

/** Browsers upload evidence straight to Supabase Storage (signed URL): the one cross-origin connection allowed. */
export function supabaseOrigin(): string {
  const url = process.env.SUPABASE_URL;
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

/**
 * Policy for HTML pages. Scripts need this request's nonce: Next.js reads it
 * from the request's CSP header and adds it to its own inline and bundle
 * scripts; 'strict-dynamic' lets those trusted scripts load their chunks.
 * Styles allow 'unsafe-inline' on purpose: React renders style attributes
 * (transforms, progress bars), which nonces can't cover. Scripts stay strict.
 */
export function pagePolicy(nonce: string, isDev: boolean): string {
  return serializeCsp({
    "default-src": "'self'",
    "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data: blob:",
    "font-src": "'self'",
    "connect-src": `'self' ${supabaseOrigin()}`,
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  });
}

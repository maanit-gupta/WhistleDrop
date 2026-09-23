import type { NextConfig } from "next";
import { serializeCsp, supabaseOrigin } from "./lib/csp";

const isDev = process.env.NODE_ENV === "development";

// Fixed policy for API routes: same-origin only, no inline scripts or styles,
// no eval (React needs eval in development only), no plugins, no framing.
// Pages don't use this: they get a per-request nonce policy from proxy.ts.
const apiDirectives = {
  "default-src": "'self'",
  "script-src": `'self'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src": "'self'",
  "img-src": "'self' data: blob:",
  "font-src": "'self'",
  "connect-src": `'self' ${supabaseOrigin()}`,
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'self'",
  "frame-ancestors": "'none'",
  ...(isDev ? {} : { "upgrade-insecure-requests": "" }),
};

// Swagger UI sets inline style attributes and uses data: URIs for its icons.
// That's the only relaxation: scripts stay 'self' (its JS is served from
// /api-docs/vendor, and it never uses eval).
const apiDocsDirectives = {
  ...apiDirectives,
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data:",
  "connect-src": "'self'",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      // One CSP per path (see lib/csp.ts). Pages: proxy.ts.
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: serializeCsp(apiDirectives) },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/api-docs/:path*",
        headers: [{ key: "Content-Security-Policy", value: serializeCsp(apiDocsDirectives) }],
      },
    ];
  },
};

export default nextConfig;

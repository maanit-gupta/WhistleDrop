import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Browsers upload evidence straight to Supabase Storage (signed URL), so that
// origin is the one cross-origin connection allowed.
const supabaseOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";

const csp = (directives: Record<string, string>) =>
  Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`.trim())
    .join("; ");

// Strict by default: same-origin only, no inline scripts or styles, no eval
// (React needs eval in development only), no plugins, no framing.
const strictDirectives = {
  "default-src": "'self'",
  "script-src": `'self'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src": "'self'",
  "img-src": "'self' data: blob:",
  "font-src": "'self'",
  "connect-src": `'self' ${supabaseOrigin}`,
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
  ...strictDirectives,
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
      {
        // Everything except /api-docs and its assets. Only one CSP header may
        // match a path: browsers enforce every CSP they receive, so a second,
        // looser header could never relax the strict one.
        source: "/:path((?!api-docs(?:/|$)).*)",
        headers: [{ key: "Content-Security-Policy", value: csp(strictDirectives) }],
      },
      {
        source: "/api-docs/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp(apiDocsDirectives) }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;

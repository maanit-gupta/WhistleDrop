import { NextResponse, type NextRequest } from "next/server";
import { pagePolicy } from "@/lib/csp";

// Per-request CSP nonce for pages, following the Next.js CSP guide
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// Next.js reads the nonce from the request's CSP header while rendering and
// adds it to its own scripts, so pages must render dynamically (the root
// layout awaits connection()).
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = pagePolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except API routes and /api-docs (fixed policies in
      // next.config.ts) and Next's static assets.
      source: "/((?!api(?:/|$)|api-docs(?:/|$)|_next/static|_next/image|favicon.ico).*)",
      // Prefetches don't render HTML and don't need a nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

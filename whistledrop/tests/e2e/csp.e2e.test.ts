/**
 * Content-Security-Policy against the real production server: pages get a
 * fresh nonce per request and Next.js puts that nonce on its own scripts;
 * API routes and /api-docs keep their fixed policies.
 */
import { describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE_URL!;

const directives = (policy: string) =>
  Object.fromEntries(
    policy.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );

async function fetchPage(path = "/") {
  const res = await fetch(`${BASE}${path}`);
  const policy = res.headers.get("content-security-policy") ?? "";
  return { res, policy, csp: directives(policy), html: await res.text() };
}

const scriptTags = (html: string) => [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
const nonceOf = (attrs: string) => attrs.match(/\bnonce="([^"]+)"/)?.[1];

describe("page CSP (proxy.ts)", () => {
  it("puts a nonce in the CSP header and the same nonce on every Next.js script, inline ones included", async () => {
    const { res, policy, csp, html } = await fetchPage();
    expect(res.status).toBe(200);

    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp["script-src"]).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);

    const tags = scriptTags(html);
    const inline = tags.filter((attrs) => !/\bsrc=/.test(attrs));
    expect(inline.length).toBeGreaterThan(0); // Next's bootstrap / RSC payload scripts
    for (const attrs of tags) expect(nonceOf(attrs)).toBe(nonce);
  });

  it("uses a fresh nonce for every request", async () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 3; i++) nonces.add((await fetchPage()).policy.match(/'nonce-([^']+)'/)![1]);
    expect(nonces.size).toBe(3);
  });

  it("has exactly the agreed page policy", async () => {
    const { res, csp } = await fetchPage();
    expect(res.headers.get("content-security-policy")).not.toContain(","); // a single policy, not two merged
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'"); // production
    expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(csp["font-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["connect-src"][0]).toBe("'self'");
    for (const extra of csp["connect-src"].slice(1)) expect(extra).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
  });

  it("doesn't expose the nonce outside the CSP header", async () => {
    const { res } = await fetchPage();
    expect(res.headers.get("x-nonce")).toBeNull();
  });

  it("keeps the other security headers on pages", async () => {
    const { res } = await fetchPage();
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("fixed policies (next.config.ts)", () => {
  it("keeps the strict API policy, without a nonce, on API routes", async () => {
    const res = await fetch(`${BASE}/api/openapi`);
    const policy = res.headers.get("content-security-policy")!;
    const csp = directives(policy);
    expect(policy).not.toContain("nonce-");
    expect(csp["script-src"]).toEqual(["'self'"]);
    expect(csp["style-src"]).toEqual(["'self'"]);
    expect(csp["base-uri"]).toEqual(["'none'"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the /api-docs policy (inline styles only) for Swagger UI and its assets", async () => {
    for (const path of ["/api-docs", "/api-docs/init.js"]) {
      const res = await fetch(`${BASE}${path}`);
      const policy = res.headers.get("content-security-policy")!;
      const csp = directives(policy);
      expect(policy).not.toContain("nonce-");
      expect(csp["script-src"]).toEqual(["'self'"]);
      expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
      expect(csp["connect-src"]).toEqual(["'self'"]);
    }
  });
});

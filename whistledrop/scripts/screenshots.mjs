// npm run screenshots
//
// Builds are done by the npm script; this starts the production server
// (`next start`), seeds whatever data the pages need THROUGH THE REAL API
// (never the database), and saves desktop (1440px) and mobile (390px)
// screenshots of every page to docs/screenshots/.
//
// Needs SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (or the SEED_MODERATOR_* pair
// the seed script uses) for an active ADMIN account, loaded from .env.local.
//
// `npm run screenshots -- --only=dashboard,reports` retakes just those pages
// (names: home, report, case-code, track, mod-login, dashboard, reports,
// report-detail, moderators).
//
// Seeding is idempotent where it can be: it reuses reports from earlier runs
// and only submits what's missing, because POST /api/reports allows 10
// submissions per hour. Case codes are never printed.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const PORT = Number(process.env.SCREENSHOTS_PORT ?? 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_KEY = "whistledrop.moderatorToken"; // lib/client/session.ts

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? process.env.SEED_MODERATOR_EMAIL;
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? process.env.SEED_MODERATOR_PASSWORD;

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

/** The showcase report: moved through several statuses, shown on the detail and Track screenshots. */
const SHOWCASE = {
  category: "CORRUPTION",
  description:
    "Invoices from one supplier are approved by the same manager who requested them, and three of last quarter's " +
    "invoices were for equipment that never arrived. The purchase orders are dated after the payments went out.",
  evidenceUrl: "https://example.org/procurement/q3-summary",
};

const FILLER = [
  { category: "SECURITY", description: "The staff VPN still accepts accounts of people who left months ago; I could sign in with an old shared login." },
  { category: "HARASSMENT", description: "A team lead repeatedly makes comments about new staff members' appearance in meetings and group chats." },
  { category: "TECHNICAL", description: "The visitor sign-in kiosk keeps a full list of names and phone numbers visible to anyone who walks up to it." },
  { category: "SECURITY", description: "Door codes for the server room are written on a sticky note inside the unlocked cupboard next to it." },
  { category: "OTHER", description: "Safety inspection records for the loading dock appear to have been signed without the inspection taking place." },
  { category: "CORRUPTION", description: "Hiring panel members were told in advance which candidate to score highest, before interviews happened." },
];

const MIN_REPORTS = 7;

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
const wanted = (name) => !ONLY || ONLY.has(name);

// ── Helpers ──────────────────────────────────────────────────────────────

const log = (...args) => console.log("[screenshots]", ...args);

function fail(message) {
  console.error(`[screenshots] ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function api(method, pathname, { token, body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = json?.error?.code ?? res.status;
    const retry = res.headers.get("Retry-After");
    fail(`${method} ${pathname.split("?")[0]} failed: ${code}${retry ? ` (retry after ${retry}s)` : ""}`);
  }
  return json;
}

async function startServer() {
  const next = path.join(ROOT, "node_modules", ".bin", "next");
  const server = spawn(next, ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  let output = "";
  server.stdout.on("data", (d) => (output += d));
  server.stderr.on("data", (d) => (output += d));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail(`next start exited early:\n${output}`);
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return server;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  fail(`next start didn't answer within 60s. Did \`next build\` run?\n${output}`);
}

// ── Seeding (API only) ───────────────────────────────────────────────────

async function listAll(token) {
  const page = await api("GET", "/api/mod/reports?pageSize=100", { token });
  return page.items;
}

async function submit(report) {
  const { caseCode } = await api("POST", "/api/reports", { body: report });
  return caseCode;
}

async function findIdByCode(token, caseCode) {
  const page = await api("GET", `/api/mod/reports?q=${encodeURIComponent(caseCode)}&pageSize=1`, { token });
  if (!page.items[0]) fail("A report submitted by this script couldn't be found again");
  return page.items[0].id;
}

const move = (token, id, newStatus, note, visibility = "PUBLIC") =>
  api("PATCH", `/api/mod/reports/${id}/status`, { token, body: { newStatus, visibility, ...(note ? { note } : {}) } });

async function seed(token) {
  let reports = await listAll(token);

  // 1. The showcase: RESOLVED, with a public and an internal update and an evidence link.
  let showcase = null;
  for (const r of reports.filter((r) => r.status === "RESOLVED")) {
    const detail = await api("GET", `/api/mod/reports/${r.id}`, { token });
    if (detail.evidenceUrl && detail.statusUpdates.length >= 2) {
      showcase = detail;
      break;
    }
  }
  if (!showcase) {
    const id = await findIdByCode(token, await submit(SHOWCASE));
    await move(token, id, "UNDER_REVIEW", "Thanks for the detail. We've started looking into the purchase records.");
    showcase = await move(
      token,
      id,
      "RESOLVED",
      "Finance confirmed the duplicate approvals. Referred to internal audit; supplier payments paused.",
      "INTERNAL",
    );
    log("seeded the showcase report (SUBMITTED → UNDER_REVIEW → RESOLVED)");
    reports = await listAll(token);
  }

  // 2. Enough reports that the tables and counts have something in them.
  const missing = Math.max(0, MIN_REPORTS - reports.length);
  for (const report of FILLER.slice(0, missing)) await submit(report);
  if (missing) {
    log(`submitted ${Math.min(missing, FILLER.length)} more report(s)`);
    reports = await listAll(token);
  }

  // 3. A spread of statuses for the dashboard, keeping at least two awaiting review.
  const submitted = () => reports.filter((r) => r.status === "SUBMITTED");
  if (!reports.some((r) => r.status === "UNDER_REVIEW") && submitted().length > 2) {
    await move(token, submitted().at(-1).id, "UNDER_REVIEW");
    reports = await listAll(token);
  }
  if (!reports.some((r) => r.status === "DISMISSED" || r.status === "CLOSED") && submitted().length > 2) {
    const id = submitted().at(-1).id;
    await move(token, id, "UNDER_REVIEW");
    await move(token, id, "DISMISSED", "Outside what this service can act on.", "INTERNAL");
    await move(token, id, "CLOSED");
    reports = await listAll(token);
  }

  log(`${reports.length} report(s) available`);
  return showcase;
}

// ── Screenshots ──────────────────────────────────────────────────────────

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // No shimmer (loading) left on the page.
  await page.waitForFunction(() => !document.querySelector('[role="status"][aria-live="polite"] > span + span'));
}

async function shoot(page, file) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
  log(`saved docs/screenshots/${file}`);
}

async function capture(browser, vp, { token, showcase }) {
  const context = await browser.newContext({
    viewport: vp.viewport,
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile ?? false,
    hasTouch: vp.hasTouch ?? false,
    reducedMotion: "reduce", // reveals render immediately; no mid-animation frames
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const file = (n, name) => `${String(n).padStart(2, "0")}-${name}-${vp.name}.png`;

  // Reporter pages
  if (wanted("home")) {
    await page.goto(`${BASE}/`);
    await shoot(page, file(1, "home"));
  }

  if (wanted("report") || wanted("case-code")) {
    await page.goto(`${BASE}/report`);
    if (wanted("report")) await shoot(page, file(2, "report"));
  }

  // Case code screen: a real submission through the form (counts towards the 10/hour limit).
  if (wanted("case-code")) {
    await page.getByLabel("Category").selectOption("TECHNICAL");
    await page
      .getByLabel("Description")
      .fill("The shared printer stores every scanned document and anyone on the guest Wi-Fi can download them.");
    await page.getByRole("button", { name: "Submit Report" }).click();
    await Promise.race([
      page.getByLabel("I have saved my case code").waitFor({ timeout: 20_000 }),
      page
        .getByText("Too many attempts")
        .waitFor({ timeout: 20_000 })
        .then(() => fail("POST /api/reports is rate limited (10 per hour). Try again later.")),
    ]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shoot(page, file(3, "case-code"));
  }

  if (wanted("track")) {
    await page.goto(`${BASE}/track`);
    await page.locator("#track-code").fill(showcase.caseCode);
    await page.getByRole("button", { name: "Track" }).click();
    await page.getByRole("heading", { name: "Your Case", exact: true }).waitFor({ timeout: 20_000 });
    await shoot(page, file(4, "track"));
  }

  // Moderator pages
  if (wanted("mod-login")) {
    await page.goto(`${BASE}/mod/login`);
    await shoot(page, file(5, "mod-login"));
  }

  // Signed in from here on: the token goes where the login page puts it.
  await context.addInitScript(([key, value]) => window.sessionStorage.setItem(key, value), [TOKEN_KEY, token]);

  if (wanted("dashboard")) {
    await page.goto(`${BASE}/mod`);
    await page.getByText("Recent Reports").waitFor();
    await shoot(page, file(6, "dashboard"));
  }

  if (wanted("reports")) {
    await page.goto(`${BASE}/mod/reports`);
    await page.getByText(/Showing \d/).waitFor();
    await shoot(page, file(7, "reports"));
  }

  if (wanted("report-detail")) {
    await page.goto(`${BASE}/mod/reports/${showcase.id}`);
    await page.getByRole("heading", { name: "History" }).waitFor();
    await shoot(page, file(8, "report-detail"));
  }

  if (wanted("moderators")) {
    await page.goto(`${BASE}/mod/moderators`);
    await page.getByRole("heading", { name: "Add a moderator" }).waitFor();
    await page.getByText(EMAIL.toLowerCase()).filter({ visible: true }).first().waitFor();
    await shoot(page, file(9, "moderators"));
  }

  await context.close();
}

async function main() {
  if (!EMAIL || !PASSWORD) fail("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (or SEED_MODERATOR_*) in .env.local");
  await mkdir(OUT_DIR, { recursive: true });

  log(`starting next start on ${BASE}`);
  const server = await startServer();
  let browser;
  try {
    const { token } = await api("POST", "/api/mod/login", { body: { email: EMAIL, password: PASSWORD } });
    const showcase = await seed(token);

    browser = await chromium.launch();
    for (const vp of VIEWPORTS) await capture(browser, vp, { token, showcase });
    log("done");
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  if (!process.exitCode) console.error(err);
  process.exitCode = 1;
});

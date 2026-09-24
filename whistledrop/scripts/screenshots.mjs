// npm run screenshots
//
// Builds are done by the npm script; this starts the production server
// (`next start`) and saves desktop (1440px) and mobile (390px) screenshots of
// every page to docs/screenshots/.
//
// Uses only the neutral demo data: it seeds (or restores) the demo accounts
// and the WD-DEMO sample cases in the database from .env.local, the same as
// `npm run seed:demo -- --force`, and signs in as admin@whistledrop.demo. The
// one report it submits (for the case code screen) is deleted afterwards. On
// the Moderators page only demo accounts reach the browser, so no personal
// address can appear in a screenshot.
//
// `npm run screenshots -- --only=dashboard,reports` retakes just those pages
// (names: home, report, case-code, track, mod-login, dashboard, reports,
// report-detail, moderators).

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { prisma } from "../lib/db";
import { deleteReportPermanently } from "../lib/cases";
import { resetDemoCases, seedDemoAccounts, seedDemoCases } from "../lib/demo";
import { DEMO_EMAILS, DEMO_PASSWORDS } from "../prisma/demo-credentials";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const PORT = Number(process.env.SCREENSHOTS_PORT ?? 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_KEY = "whistledrop.moderatorToken"; // lib/client/session.ts

const EMAIL = DEMO_EMAILS.admin;
const PASSWORD = DEMO_PASSWORDS.admin;

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

/** Sample cases (lib/demo.ts): an ongoing conversation, shown on Track and the report detail. */
const SHOWCASE_CODE = "WD-DEMO-0001";

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

// ── Data ─────────────────────────────────────────────────────────────────

async function findIdByCode(token, caseCode) {
  const page = await api("GET", `/api/mod/reports?q=${encodeURIComponent(caseCode)}&pageSize=1`, { token });
  if (!page.items[0]) fail(`${caseCode} not found`);
  return page.items[0].id;
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

/** Case codes of reports this run submitted; deleted at the end. */
const submitted = new Set();

async function capture(browser, vp, { token, showcase }) {
  const context = await browser.newContext({
    viewport: vp.viewport,
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile ?? false,
    hasTouch: vp.hasTouch ?? false,
    reducedMotion: "reduce", // reveals render immediately; no mid-animation frames
    colorScheme: "dark",
  });
  // Only demo accounts reach the Moderators page.
  await context.route("**/api/admin/moderators", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.items = body.items.filter((m) => m.isDemo);
    await route.fulfill({ response, json: body });
  });
  const page = await context.newPage();
  const file = (n, name) => `${String(n).padStart(2, "0")}-${name}-${vp.name}.png`;

  // Reporter pages
  if (wanted("home")) {
    await page.goto(`${BASE}/`);
    // Wait until the demo video has its first frame, so its poster shows without the loading spinner.
    await page.waitForFunction(() => [...document.querySelectorAll("video")].every((v) => v.readyState >= 2));
    await page.waitForTimeout(1500);
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
    submitted.add((await page.locator("body").innerText()).match(/WD-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0]);
    await shoot(page, file(3, "case-code"));
  }

  if (wanted("track")) {
    await page.goto(`${BASE}/track`);
    await page.locator("#track-code").fill(SHOWCASE_CODE);
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
    await page.getByRole("heading", { name: "Conversation with reporter" }).waitFor();
    await shoot(page, file(8, "report-detail"));
  }

  if (wanted("moderators")) {
    await page.goto(`${BASE}/mod/moderators`);
    await page.getByRole("heading", { name: "Add a moderator" }).waitFor();
    await page.getByText(EMAIL).filter({ visible: true }).first().waitFor();
    await shoot(page, file(9, "moderators"));
  }

  await context.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  log("seeding demo accounts and restoring the sample cases");
  await seedDemoCases(await seedDemoAccounts(DEMO_PASSWORDS));
  await resetDemoCases();

  log(`starting next start on ${BASE}`);
  const server = await startServer();
  let browser;
  try {
    const { token } = await api("POST", "/api/mod/login", { body: { email: EMAIL, password: PASSWORD } });
    const showcase = { caseCode: SHOWCASE_CODE, id: await findIdByCode(token, SHOWCASE_CODE) };

    browser = await chromium.launch();
    for (const vp of VIEWPORTS) await capture(browser, vp, { token, showcase });
    log("done");
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
    for (const caseCode of submitted) {
      const report = caseCode && (await prisma.report.findUnique({ where: { caseCode }, select: { id: true } }));
      if (report) await deleteReportPermanently(report.id);
    }
    if (submitted.size) log(`deleted the ${submitted.size} report(s) submitted for the case code screen`);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  if (!process.exitCode) console.error(err);
  process.exitCode = 1;
});

// npm run record:demo
//
// Records the walkthrough video shown in the home page's Demo section:
//   1. seeds the demo accounts and sample cases in the DEVELOPMENT database
//      (.env.local), the same as `npm run seed:demo -- --force`, and puts the
//      samples back in their seeded state;
//   2. starts the production build (`next start`; the npm script builds first);
//   3. drives Chromium through a full case at human speed, recording at 1440×900;
//   4. converts the recording with ffmpeg-static into public/media/demo.mp4,
//      public/media/demo-poster.jpg and docs/demo/demo-preview.gif;
//   5. writes the chapter timestamps into lib/demo.ts (DEMO_CHAPTERS);
//   6. deletes the report it created, so a re-run starts clean.
//
// Recording-only additions, injected into the browser by this script and never
// part of the app: a caption bar naming each step, and a visible cursor
// (headless recordings have none). On the Moderators page, accounts that
// aren't demo accounts are left out of the list the browser receives, so no
// personal address can appear in the video.
//
// Uses real rate limits: one report submission, two sign-ins and a few lookups.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { chromium, type Locator, type Page } from "playwright";
import { prisma } from "../lib/db";
import { deleteReportPermanently } from "../lib/cases";
import { resetDemoCases, seedDemoAccounts, seedDemoCases } from "../lib/demo";
import { DEMO_EMAILS, DEMO_PASSWORDS } from "../prisma/demo-credentials";

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.RECORD_PORT ?? 3124);
const BASE = `http://127.0.0.1:${PORT}`;
const SIZE = { width: 1440, height: 900 };
const MP4 = path.join(ROOT, "public/media/demo.mp4");
const POSTER = path.join(ROOT, "public/media/demo-poster.jpg");
const GIF = path.join(ROOT, "docs/demo/demo-preview.gif");
const DEMO_TS = path.join(ROOT, "lib/demo.ts");
const MAX_MP4_BYTES = 15 * 1024 * 1024;
const MAX_GIF_BYTES = 8 * 1024 * 1024;
const GIF_SECONDS = 13;

const log = (...args: unknown[]) => console.log("[record-demo]", ...args);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chapter shown on the site, with its one-line text summary. */
const CHAPTER_SUMMARIES = {
  Submit: "A report is written and sent with an image attached; the case code is copied and saved.",
  Track: "The case code shows the report as Submitted, with an empty conversation.",
  Review:
    "A moderator signs in, finds the case, starts the review with a public note, adds an internal note and asks the reporter a question.",
  Conversation:
    "The reporter sees the question from the review team (the internal note isn't there) and answers; the moderator reads it and resolves the case.",
  Close:
    "The case is closed permanently: evidence is deleted, and the reporter can still read the whole conversation but not reply.",
  Admin: "A demo admin tries to deactivate a demo account and the server refuses; then the API docs.",
} as const;
type ChapterLabel = keyof typeof CHAPTER_SUMMARIES;

// ── Server ───────────────────────────────────────────────────────────────

async function startServer(): Promise<ChildProcess> {
  const server = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    // A normal instance: the walkthrough shows the product, not the demo banner.
    env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "false" },
  });
  let output = "";
  server.stdout?.on("data", (d) => (output += d));
  server.stderr?.on("data", (d) => (output += d));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early:\n${output}`);
    try {
      if ((await fetch(`${BASE}/`)).ok) return server;
    } catch {
      // not listening yet
    }
    await pause(500);
  }
  server.kill();
  throw new Error(`next start didn't answer within 60s. Did \`next build\` run?\n${output}`);
}

// ── Recording-only overlay ───────────────────────────────────────────────

/**
 * Runs in the page before any app script: draws the caption bar and the
 * cursor; the app never ships them. A plain string, so the TypeScript
 * toolchain can't add helpers the page doesn't have.
 */
const OVERLAY_SCRIPT = `(() => {
  const mount = () => {
    if (document.getElementById("__wd-demo-overlay")) return;
    const style = document.createElement("style");
    style.textContent = \`
      #__wd-demo-caption { position: fixed; left: 24px; bottom: 24px; z-index: 2147483000; max-width: 760px;
        display: grid; gap: 4px; padding: 14px 20px 16px; background: var(--ink-950, #0d0d0d);
        border: 1px solid var(--line-dark, #3a3a3a); border-radius: 4px; color: var(--text-light, #f5f5f5);
        font-family: var(--font-ui, Arial, sans-serif); font-size: 15px; line-height: 1.4; pointer-events: none; }
      #__wd-demo-caption[hidden] { display: none; }
      #__wd-demo-caption .eyebrow { color: var(--lime-500, #bdfc8a); font-size: 11px; letter-spacing: 0.14em;
        text-transform: uppercase; }
      #__wd-demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483001; width: 18px; height: 18px;
        margin: -9px 0 0 -9px; border-radius: 50%; background: rgba(189, 252, 138, 0.9);
        border: 2px solid #0d0d0d; pointer-events: none; transition: scale 120ms ease; }
      #__wd-demo-cursor.down { scale: 0.7; }\`;
    const overlay = document.createElement("div");
    overlay.id = "__wd-demo-overlay";
    overlay.innerHTML =
      '<div id="__wd-demo-caption" hidden><span class="eyebrow"></span><span class="text"></span></div>' +
      '<div id="__wd-demo-cursor"></div>';
    document.head.append(style);
    document.body.append(overlay);
    const cursor = document.getElementById("__wd-demo-cursor");
    const last = sessionStorage.getItem("__wdDemoCursor");
    if (last) cursor.style.translate = last;
    addEventListener("mousemove", (e) => {
      cursor.style.translate = e.clientX + "px " + e.clientY + "px";
      sessionStorage.setItem("__wdDemoCursor", cursor.style.translate);
    }, true);
    addEventListener("mousedown", () => cursor.classList.add("down"), true);
    addEventListener("mouseup", () => cursor.classList.remove("down"), true);
    window.__wdCaption = () => {
      const saved = sessionStorage.getItem("__wdDemoCaption");
      const box = document.getElementById("__wd-demo-caption");
      if (!saved) { box.hidden = true; return; }
      const value = JSON.parse(saved);
      box.querySelector(".eyebrow").textContent = value.eyebrow;
      box.querySelector(".text").textContent = value.text;
      box.hidden = false;
    };
    window.__wdCaption();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();`;

class Walkthrough {
  readonly marks: { label: ChapterLabel; at: number }[] = [];
  /** Stretches of the recording spent waiting on the network, trimmed in the edit. */
  readonly cuts: [number, number][] = [];
  posterAt = 0;
  highlightAt = 0;
  private readonly t0 = Date.now();

  constructor(readonly page: Page) {}

  /**
   * Runs `wait` (a page load or an API round trip to the database) and marks
   * the time it took for trimming, keeping a short beat so the change of
   * screen still reads.
   */
  async waiting<T>(wait: () => Promise<T>): Promise<T> {
    const start = this.now();
    const result = await wait();
    const end = this.now();
    if (end - start > 0.9) this.cuts.push([start + 0.45, end - 0.1]);
    return result;
  }

  /** Clicks, then waits (trimmed) for the API call the click makes. */
  async act(target: Locator, api: string, method: "POST" | "PATCH", { wait = 700 } = {}) {
    const response = this.page.waitForResponse(
      (r) => r.request().method() === method && new URL(r.url()).pathname.endsWith(api),
      { timeout: 60_000 },
    );
    await this.click(target, { wait: 0 });
    const res = await this.waiting(() => response);
    if (!res.ok()) throw new Error(`${method} ${api} answered ${res.status()}`);
    await pause(wait);
  }

  /** Seconds since recording started (the video's timeline). */
  now() {
    return (Date.now() - this.t0) / 1000;
  }

  chapter(label: ChapterLabel) {
    this.marks.push({ label, at: Math.max(0, this.now() - 0.3) });
  }

  async caption(step: number, eyebrow: string, text: string) {
    await this.page.evaluate(
      ([value]) => {
        sessionStorage.setItem("__wdDemoCaption", value);
        (window as unknown as { __wdCaption?: () => void }).__wdCaption?.();
      },
      [JSON.stringify({ eyebrow: `Step ${step} · ${eyebrow}`, text })],
    );
    await pause(700);
  }

  async goto(pathname: string) {
    await this.waiting(async () => {
      await this.page.goto(`${BASE}${pathname}`, { waitUntil: "networkidle" });
      await this.page.evaluate(() => document.fonts.ready);
    });
  }

  /** Scrolls smoothly so the element sits `offset` px below the top. */
  async scrollTo(target: Locator, offset = 170) {
    const top = await target.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
    await this.page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), Math.max(0, top));
    await pause(1000);
  }

  async scrollBy(dy: number) {
    await this.page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), dy);
    await pause(1100);
  }

  /** Moves the visible cursor to the element, then clicks it. */
  async click(target: Locator, { wait = 500 } = {}) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("click target is not visible");
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await pause(250);
    await target.click();
    await pause(wait);
  }

  async type(target: Locator, text: string) {
    await this.click(target, { wait: 200 });
    await target.pressSequentially(text, { delay: 28 });
    await pause(400);
  }
}

// ── The walkthrough ──────────────────────────────────────────────────────

async function sampleImage(dir: string) {
  const file = path.join(dir, "sample-evidence.png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <rect width="1200" height="800" fill="#e9e7e2"/>
    <rect x="120" y="110" width="960" height="580" rx="6" fill="#ffffff" stroke="#9a9a9a" stroke-width="3"/>
    <rect x="170" y="170" width="520" height="34" fill="#262626"/>
    ${[260, 320, 380, 440, 500, 560].map((y, i) => `<rect x="170" y="${y}" width="${[860, 780, 820, 640, 800, 520][i]}" height="18" fill="#c9c7c2"/>`).join("")}
    <text x="600" y="760" font-family="Arial" font-size="30" fill="#595959" text-anchor="middle">Sample evidence · demo only</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function login(w: Walkthrough, email: string, password: string) {
  const { page } = w;
  await w.type(page.getByLabel("Email"), email);
  await w.type(page.getByLabel("Password"), password);
  await w.click(page.getByRole("button", { name: "Sign In" }), { wait: 0 });
  await w.waiting(async () => {
    await page.waitForURL(`${BASE}/mod`, { timeout: 30_000 });
    await page.getByText("Recent Reports").waitFor({ timeout: 30_000 });
  });
  await pause(600);
}

async function trackAs(w: Walkthrough, caseCode: string) {
  const { page } = w;
  await w.goto("/track");
  await w.type(page.locator("#track-code"), caseCode);
  await w.act(page.getByRole("button", { name: "Track", exact: true }), "/api/reports/lookup", "POST");
  await page.locator("#track-conversation").waitFor({ timeout: 20_000 });
}

async function walkthrough(w: Walkthrough, imageFile: string): Promise<string> {
  const { page } = w;
  const A = 1300; // a beat for viewers to read

  // 1. Home
  await w.goto("/");
  await w.caption(1, "Home", "WhistleDrop: report wrongdoing anonymously. No account, no email, no tracking.");
  await pause(A);
  await w.scrollTo(page.getByText("Three Doors,").first(), 120);
  await w.caption(1, "Home", "Three ways in: make a report, track a case, or sign in as a moderator.");
  await pause(A);

  // 2. Submit
  w.chapter("Submit");
  await w.click(page.getByRole("link", { name: "Report", exact: true }).first(), { wait: 0 });
  await w.waiting(() => page.locator("#report-category").waitFor());
  await w.caption(2, "Submit", "A reporter describes the problem and attaches evidence. Image metadata is stripped.");
  await w.scrollTo(page.locator("#report-category"), 180);
  await w.click(page.locator("#report-category"), { wait: 200 });
  await page.locator("#report-category").selectOption("SECURITY");
  await pause(400);
  await w.type(
    page.locator("#report-description"),
    "The backup server in the east wing still runs an unsupported operating system. It has not had security updates since last year.",
  );
  await page.locator('input[type="file"]').setInputFiles(imageFile);
  await pause(A);
  await w.click(page.getByRole("button", { name: "Submit Report" }), { wait: 600 });
  await w.waiting(() => page.getByLabel("I have saved my case code").waitFor({ timeout: 60_000 }));
  const caseCode = (await page.locator("body").innerText()).match(/WD-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
  if (!caseCode) throw new Error("no case code on the case code screen");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await w.caption(2, "Submit", "The only link to the report is this case code. It's shown once: copy it and keep it safe.");
  await pause(A);
  await w.click(page.getByRole("button", { name: "Copy" }), { wait: 900 });
  await w.click(page.getByLabel("I have saved my case code"), { wait: 900 });

  // 3. Track
  w.chapter("Track");
  await w.click(page.getByRole("button", { name: /Track this case/ }), { wait: 0 });
  await w.waiting(() => page.locator("#track-conversation").waitFor({ timeout: 30_000 }));
  await w.caption(3, "Track", "With the code, the reporter sees the status: Submitted. No one has replied yet.");
  await pause(A);
  await w.scrollTo(page.locator("#track-conversation"));
  await pause(A);

  // 4. Moderator sign-in and dashboard
  w.chapter("Review");
  await w.goto("/mod/login");
  await w.caption(4, "Review", "A moderator signs in. (Demo account: aria@whistledrop.demo.)");
  await login(w, DEMO_EMAILS.aria, DEMO_PASSWORDS.aria);
  await w.caption(4, "Review", "The dashboard: new cases Awaiting Review, and cases Awaiting Reply from a reporter.");
  await pause(2 * A);

  // 5. Reports list: search and filter
  await w.click(page.getByRole("link", { name: "Reports", exact: true }).first(), { wait: 0 });
  await w.waiting(() => page.getByText(/Showing \d/).waitFor({ timeout: 30_000 }));
  await w.caption(5, "Review", "Search by case code or text, and filter by status.");
  await w.type(page.getByLabel("Search"), caseCode);
  await w.click(page.locator("label", { hasText: /^Submitted$/ }).first(), { wait: 0 });
  const row = page.getByRole("link", { name: `Open report ${caseCode}` }).filter({ visible: true }).first();
  await w.waiting(async () => {
    await row.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, null, { timeout: 30_000 });
  });
  await pause(A);
  await w.click(row, { wait: 0 });

  // 6. Report detail
  await w.waiting(() => page.getByRole("heading", { name: "Conversation with reporter" }).waitFor({ timeout: 30_000 }));
  await w.caption(6, "Review", "Start the review with a public note. The reporter will see it.");
  await pause(A / 2);
  await w.type(page.getByLabel("Note (optional)"), "Thank you. We have started looking into this.");
  await w.act(page.getByRole("button", { name: "Under review" }), "/status", "PATCH", { wait: 1000 });
  await w.caption(6, "Review", "Internal notes are for staff only. They never reach the reporter.");
  const internal = page.getByLabel("Internal note — never visible to the reporter");
  await w.scrollTo(page.getByRole("heading", { name: "Internal notes" }), 160);
  await w.type(internal, "Asked IT for the server inventory. No names shared.");
  await w.act(page.getByRole("button", { name: "Add internal note" }), "/notes", "POST", { wait: 1000 });
  await w.caption(6, "Review", "A reply goes to the reporter, signed only as the review team.");
  const reply = page.getByLabel("Reply to reporter — visible to the reporter");
  await w.scrollTo(page.getByRole("heading", { name: "Conversation with reporter" }), 120);
  await w.type(reply, "Thank you. Roughly which team uses this server? Please don't include any names.");
  await w.act(page.getByRole("button", { name: "Send reply" }), "/messages", "POST", { wait: 1200 });

  // 7. Reporter answers
  w.chapter("Conversation");
  await w.caption(7, "Conversation", "Back to the reporter, with only the case code.");
  await trackAs(w, caseCode);
  await w.scrollTo(page.locator("#track-conversation"), 120);
  w.highlightAt = Math.max(0, w.now() - 0.5);
  await w.caption(7, "Conversation", "The question appears under REVIEW TEAM. The internal note is nowhere to be seen.");
  w.posterAt = w.now() + 0.3;
  await pause(2 * A);
  await w.type(page.getByLabel("Your reply"), "It is used by the facilities team for building plans.");
  await w.act(page.getByRole("button", { name: "Send", exact: true }), "/api/reports/messages", "POST", { wait: 1200 });
  await w.caption(7, "Conversation", "The answer is sent anonymously: the message is stored with nothing about the sender.");
  await pause(A);

  // 8. Moderator reads the answer and resolves
  await w.goto("/mod/reports");
  await w.waiting(() => page.getByText(/Showing \d/).waitFor({ timeout: 30_000 }));
  await w.caption(8, "Conversation", "The moderator sees a REPLY tag: the reporter wrote last.");
  await w.click(page.getByLabel("Awaiting reply"), { wait: 0 });
  const replyRow = page.getByRole("link", { name: `Open report ${caseCode}` }).filter({ visible: true }).first();
  await w.waiting(async () => {
    await page.waitForURL(/awaitingReply=true/);
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 30_000 });
    await replyRow.waitFor({ timeout: 30_000 });
  });
  await pause(A);
  await w.click(replyRow, { wait: 0 });
  await w.waiting(() => page.getByRole("heading", { name: "Conversation with reporter" }).waitFor({ timeout: 30_000 }));
  await w.scrollTo(page.getByRole("heading", { name: "Conversation with reporter" }), 120);
  await w.caption(8, "Conversation", "They read the answer, then resolve the case with a public note.");
  await pause(A);
  await w.type(page.getByLabel("Note (optional)"), "The server has been scheduled for an upgrade this month.");
  await w.act(page.getByRole("button", { name: "Resolved" }), "/status", "PATCH", { wait: 1000 });

  // 9. Close
  w.chapter("Close");
  await w.caption(9, "Close", "Closing is permanent: every evidence file is deleted and the case becomes read-only.");
  await w.click(page.getByRole("button", { name: "Close case" }), { wait: 900 });
  await pause(A);
  await w.act(page.getByRole("button", { name: "Close permanently" }), "/status", "PATCH", { wait: 600 });
  await page.getByText("Evidence files were deleted when this case was closed.").waitFor({ timeout: 30_000 });
  await w.scrollTo(page.getByRole("heading", { name: "Attachments" }), 140);
  await pause(A);

  // 10. Reporter after closing
  await w.caption(10, "Close", "The reporter can still read everything, but the conversation is now read-only.");
  await trackAs(w, caseCode);
  await w.scrollTo(page.getByText("Evidence files have been deleted.").first(), 300);
  await pause(A);
  await w.scrollTo(page.getByText("This case is closed. The conversation is read-only.").first(), 520);
  await pause(2 * A);

  // 11. Admin: demo accounts are protected
  w.chapter("Admin");
  await w.goto("/mod");
  await w.waiting(() => page.getByText("Recent Reports").waitFor({ timeout: 30_000 }));
  await w.click(page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first(), { wait: 0 });
  await w.waiting(() => page.getByRole("button", { name: "Sign In" }).waitFor({ timeout: 30_000 }));
  await w.caption(11, "Admin", "An admin signs in. (Demo account: admin@whistledrop.demo.)");
  await login(w, DEMO_EMAILS.admin, DEMO_PASSWORDS.admin);
  await w.click(page.getByRole("link", { name: "Moderators", exact: true }).first(), { wait: 0 });
  await w.waiting(async () => {
    await page.getByRole("heading", { name: "Add a moderator" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: `Deactivate (${DEMO_EMAILS.aria})` }).waitFor({ timeout: 30_000 });
  });
  await w.caption(11, "Admin", "Demo accounts' passwords are public, so the server protects them.");
  await pause(A);
  const refused = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/admin/moderators/"));
  await w.click(page.getByRole("button", { name: `Deactivate (${DEMO_EMAILS.aria})` }), { wait: 0 });
  await w.waiting(() => refused);
  await page.getByText("Demo accounts can't be deactivated or have their role changed").filter({ visible: true }).first().waitFor();
  await w.caption(11, "Admin", "Refused by the server: demo accounts can't be deactivated or change role.");
  await pause(2 * A);

  // 12. API docs
  await w.goto("/api-docs");
  await w.caption(12, "Admin", "Every endpoint is documented in the OpenAPI spec, at /api-docs.");
  await pause(A);
  await w.scrollBy(500);
  await pause(A);
  return caseCode;
}

// ── Post-processing ──────────────────────────────────────────────────────

/** The trimmed stretches, sorted and merged. */
function normalizedCuts(w: Walkthrough): [number, number][] {
  const sorted = w.cuts.filter(([a, b]) => b - a > 0.05).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** A time on the raw recording → the same moment in the trimmed video. */
function toEdited(t: number, cuts: [number, number][]) {
  let removed = 0;
  for (const [a, b] of cuts) {
    if (t >= b) removed += b - a;
    else if (t > a) removed += t - a;
  }
  return t - removed;
}

function ffmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

async function encode(webm: string, w: Walkthrough, cuts: [number, number][]) {
  await mkdir(path.dirname(MP4), { recursive: true });
  await mkdir(path.dirname(GIF), { recursive: true });

  // Drop the network waits, then renumber the frames so the video plays straight through.
  const keep = cuts.length
    ? `select='not(${cuts.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+")})',setpts=N/FRAME_RATE/TB,`
    : "";
  const posterAt = toEdited(w.posterAt, cuts);
  const highlightAt = toEdited(w.highlightAt, cuts);
  for (const crf of [26, 30, 34]) {
    ffmpeg([
      "-i", webm, "-an", "-vf", `fps=30,${keep}scale=1440:-2:flags=lanczos`, "-c:v", "libx264", "-preset", "slow",
      "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", MP4,
    ]);
    const { size } = await stat(MP4);
    log(`demo.mp4: ${(size / 1024 / 1024).toFixed(1)} MB (crf ${crf})`);
    if (size <= MAX_MP4_BYTES) break;
    if (crf === 34) throw new Error("demo.mp4 is still over 15 MB");
  }

  ffmpeg(["-ss", posterAt.toFixed(2), "-i", MP4, "-frames:v", "1", "-q:v", "3", POSTER]);
  log(`demo-poster.jpg at ${posterAt.toFixed(1)}s`);

  for (const width of [800, 680, 560]) {
    const filters =
      `fps=10,scale=${width}:-1:flags=lanczos,split[a][b];` +
      "[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";
    ffmpeg(["-ss", highlightAt.toFixed(2), "-t", String(GIF_SECONDS), "-i", MP4, "-filter_complex", filters, "-loop", "0", GIF]);
    const { size } = await stat(GIF);
    log(`demo-preview.gif: ${(size / 1024 / 1024).toFixed(1)} MB (${width}px, ${GIF_SECONDS}s)`);
    if (size <= MAX_GIF_BYTES) return;
  }
  throw new Error("demo-preview.gif is still over 8 MB");
}

/** Rewrites the generated DEMO_CHAPTERS block in lib/demo.ts. */
async function writeChapters(w: Walkthrough, cuts: [number, number][], duration: number) {
  const source = await readFile(DEMO_TS, "utf8");
  const begin = source.indexOf("// BEGIN demo-chapters");
  const end = source.indexOf("// END demo-chapters");
  if (begin < 0 || end < 0) throw new Error("demo-chapters markers not found in lib/demo.ts");
  const headerEnd = source.indexOf("\n", begin) + 1;
  const chapters = w.marks
    .map(({ label, at }) => `  { label: "${label}", start: ${toEdited(at, cuts).toFixed(1)}, summary: ${JSON.stringify(CHAPTER_SUMMARIES[label])} },`)
    .join("\n");
  const block =
    `export const DEMO_VIDEO_DURATION = ${duration.toFixed(1)};\n` +
    `export const DEMO_CHAPTERS: readonly DemoChapter[] = [\n${chapters}\n];\n`;
  await writeFile(DEMO_TS, source.slice(0, headerEnd) + block + source.slice(end));
  log("chapters written to lib/demo.ts:", w.marks.map((m) => `${m.label} ${toEdited(m.at, cuts).toFixed(1)}s`).join(", "));
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  log("seeding demo accounts and sample cases (development database)");
  await seedDemoCases(await seedDemoAccounts(DEMO_PASSWORDS));
  await resetDemoCases();

  const work = await mkdtemp(path.join(tmpdir(), "whistledrop-demo-"));
  const imageFile = await sampleImage(work);
  log(`starting next start on ${BASE}`);
  const server = await startServer();
  const browser = await chromium.launch();
  let caseCode: string | undefined;
  try {
    const context = await browser.newContext({
      viewport: SIZE,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      recordVideo: { dir: work, size: SIZE },
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await context.addInitScript({ content: OVERLAY_SCRIPT });
    // Only demo accounts reach the Moderators page in the recording.
    await context.route("**/api/admin/moderators", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      body.items = body.items.filter((m: { isDemo: boolean }) => m.isDemo);
      await route.fulfill({ response, json: body });
    });

    const page = await context.newPage();
    const w = new Walkthrough(page);
    caseCode = await walkthrough(w, imageFile);
    const cuts = normalizedCuts(w);
    const duration = toEdited(w.now(), cuts);
    const video = page.video();
    await context.close();
    const webm = await video!.path();
    log(`recorded ${w.now().toFixed(0)}s; ${duration.toFixed(0)}s after trimming ${cuts.length} network waits`);

    await encode(webm, w, cuts);
    await writeChapters(w, cuts, duration);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    if (caseCode) {
      const report = await prisma.report.findUnique({ where: { caseCode }, select: { id: true } });
      if (report) await deleteReportPermanently(report.id);
      log("deleted the report created by the recording");
    }
    await prisma.$disconnect();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

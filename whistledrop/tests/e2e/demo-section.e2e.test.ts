/**
 * The home page's Demo section against the production build: a native,
 * self-hosted video that never autoplays, chapter buttons that seek to the
 * recorded timestamps (lib/demo.ts), and the nav's Demo link from any page.
 *
 * Needs Chromium for Playwright: npx playwright install chromium
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

const BASE = process.env.E2E_BASE_URL!;
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe("home Demo section", () => {
  it("uses a native, local, non-autoplaying video with a poster and metadata-only preload", async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    const tag = html.match(/<video\b[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('src="/media/demo.mp4"');
    expect(tag).toContain('poster="/media/demo-poster.jpg"');
    expect(tag).toContain('preload="metadata"');
    expect(tag).toMatch(/\bcontrols\b/);
    expect(tag).toMatch(/\bplaysInline\b|\bplaysinline\b/);
    expect(tag).not.toMatch(/\bautoplay\b/i);
    expect(html).not.toMatch(/<iframe\b/);

    for (const file of ["/media/demo.mp4", "/media/demo-poster.jpg"]) {
      const res = await fetch(`${BASE}${file}`, { method: "HEAD" });
      expect(res.status).toBe(200);
    }
  });

  it("sits between the Distinction and Privacy, By Design sections", async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    const at = (text: string) => html.indexOf(text);
    expect(at("Distinction")).toBeGreaterThan(-1);
    expect(at('id="demo"')).toBeGreaterThan(at("Distinction"));
    expect(at("Privacy, By Design")).toBeGreaterThan(at('id="demo"'));
  });

  it("has chapter buttons that jump to their timestamps, and stays paused until asked", async () => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(`${BASE}/#demo`, { waitUntil: "networkidle" });
    const video = page.locator("#demo video");
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

    // textContent, not innerText: the eyebrow style upper-cases the labels on screen.
    const labels = await page.locator("#demo [data-start]").allTextContents();
    expect(labels.map((l) => l.match(/^[A-Za-z]+/)?.[0])).toEqual(["Submit", "Track", "Review", "Conversation", "Close", "Admin"]);

    const chapter = page.locator("#demo button[data-start]").nth(3);
    const start = Number(await chapter.getAttribute("data-start"));
    expect(start).toBeGreaterThan(0);
    await chapter.click();
    await page.waitForFunction(
      (s) => Math.abs((document.querySelector("#demo video") as HTMLVideoElement).currentTime - s) < 2,
      start,
    );
    expect(await page.locator("#demo-summary li").count()).toBe(6);
    await page.close();
  });

  it("is reachable from the nav's Demo link on another page", async () => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(`${BASE}/track`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Demo", exact: true }).first().click();
    await page.waitForURL(`${BASE}/#demo`);
    await page.locator("#demo video").waitFor();
    await page.waitForFunction(() => {
      const top = document.getElementById("demo")!.getBoundingClientRect().top;
      return top >= -2 && top < window.innerHeight / 2;
    });
    await page.close();
  });
});

/**
 * DEMO_MODE safeguards against the real production build, on two servers from
 * the same build (tests/e2e/globalSetup.ts): the banner on Home, Report and
 * Track, and the report form's acknowledgement checkbox. The form's POST is
 * intercepted in the browser, so no database is involved.
 *
 * Needs Chromium for Playwright: npx playwright install chromium
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

const NORMAL = process.env.E2E_BASE_URL!;
const DEMO = process.env.E2E_DEMO_BASE_URL!;
const BANNER = "Public demo. Reports here are visible to anyone using the demo moderator accounts. Do not submit real information.";
const ACKNOWLEDGEMENT = "I understand this is a demo and I'm not submitting real information.";
const REPORTER_PAGES = ["/", "/report", "/track"];

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function open(base: string, path: string): Promise<Page> {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  return page;
}

describe("demo banner", () => {
  it.each(REPORTER_PAGES)("is shown on %s when DEMO_MODE=true, in warm paper and dark ink (never lime)", async (path) => {
    const page = await open(DEMO, path);
    const banner = page.locator("[data-demo-banner]");
    await expect(banner.innerText()).resolves.toBe(BANNER);
    expect(await banner.getAttribute("role")).toBe("note");

    const colors = await banner.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color, position: style.position };
    });
    expect(colors).toEqual({ background: "rgb(243, 242, 240)", color: "rgb(13, 13, 13)", position: "fixed" });

    // The page is pushed below it, so nothing is hidden behind the banner.
    const [bannerBox, bodyPadding] = await Promise.all([
      banner.boundingBox(),
      page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingTop)),
    ]);
    expect(bodyPadding).toBeCloseTo(bannerBox!.height, 0);
    await page.close();
  });

  it.each(REPORTER_PAGES)("is absent on %s when DEMO_MODE is false", async (path) => {
    const html = await (await fetch(`${NORMAL}${path}`)).text();
    expect(html).not.toContain("data-demo-banner");
    expect(html).not.toContain("Public demo.");
  });

  it("isn't added to the moderator sign-in page", async () => {
    const html = await (await fetch(`${DEMO}/mod/login`)).text();
    expect(html).not.toContain("data-demo-banner");
  });
});

describe("report form acknowledgement", () => {
  /** Fills in a valid report and records whether the form tries to POST it (answered with a fake 201). */
  async function fillReport(base: string) {
    const page = await open(base, "/report");
    const posts: string[] = [];
    await page.route("**/api/reports", async (route) => {
      posts.push(route.request().postData() ?? "");
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ caseCode: "WD-TEST-ABCD" }) });
    });
    await page.selectOption("#report-category", "TECHNICAL");
    await page.fill("#report-description", "This is only an end-to-end test of the demo acknowledgement.");
    return { page, posts };
  }

  it("blocks submission on a demo instance until the box is ticked", async () => {
    const { page, posts } = await fillReport(DEMO);
    const checkbox = page.getByLabel(ACKNOWLEDGEMENT);
    expect(await checkbox.isChecked()).toBe(false);

    await page.getByRole("button", { name: "Submit Report" }).click();
    await page.getByText("Tick this box to confirm before submitting.").waitFor();
    expect(posts).toEqual([]);
    // Focus moves to the box so keyboard and screen-reader users land on it.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("report-demo-acknowledge");

    await checkbox.check();
    await page.getByRole("button", { name: "Submit Report" }).click();
    await page.getByText("WD-TEST-ABCD").first().waitFor();
    expect(posts).toHaveLength(1);
    // The acknowledgement is a UI safeguard only: nothing extra is sent.
    expect(Object.keys(JSON.parse(posts[0])).sort()).toEqual(["category", "description"]);
    await page.close();
  });

  it("isn't shown, and doesn't block anything, when DEMO_MODE is false", async () => {
    const { page, posts } = await fillReport(NORMAL);
    expect(await page.getByLabel(ACKNOWLEDGEMENT).count()).toBe(0);
    await page.getByRole("button", { name: "Submit Report" }).click();
    await page.getByText("WD-TEST-ABCD").first().waitFor();
    expect(posts).toHaveLength(1);
    await page.close();
  });
});

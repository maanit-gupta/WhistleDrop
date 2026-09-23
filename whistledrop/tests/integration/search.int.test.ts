import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReportCategory, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import { resetDatabase } from "./db";
import { api, createAccount } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

// Fixed dataset, inserted once; every test only reads.
const REPORTS: { caseCode: string; category: ReportCategory; status: ReportStatus; description: string; createdAt: string; updatedAt: string }[] = [
  { caseCode: "WD-AAAA-0001", category: "SECURITY", status: "SUBMITTED", description: "Open S3 bucket leaking customer data", createdAt: "2026-01-05T10:00:00Z", updatedAt: "2026-01-05T10:00:00Z" },
  { caseCode: "WD-AAAA-0002", category: "CORRUPTION", status: "UNDER_REVIEW", description: "Vendor kickbacks in the procurement team", createdAt: "2026-01-10T09:00:00Z", updatedAt: "2026-02-20T09:00:00Z" },
  { caseCode: "WD-BBBB-0003", category: "HARASSMENT", status: "RESOLVED", description: "Manager repeatedly harassing new hires", createdAt: "2026-01-10T23:30:00Z", updatedAt: "2026-01-11T08:00:00Z" },
  { caseCode: "WD-BBBB-0004", category: "SECURITY", status: "DISMISSED", description: "Password written on a sticky note, 100% visible", createdAt: "2026-02-01T12:00:00Z", updatedAt: "2026-02-02T12:00:00Z" },
  { caseCode: "WD-CCCC-0005", category: "TECHNICAL", status: "CLOSED", description: "Backup job silently failing for PROCUREMENT db", createdAt: "2026-02-15T08:00:00Z", updatedAt: "2026-03-01T08:00:00Z" },
  { caseCode: "WD-CCCC-0006", category: "OTHER", status: "SUBMITTED", description: "Expense fraud using 100x inflated invoices", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  { caseCode: "WD-DDDD-0007", category: "CORRUPTION", status: "SUBMITTED", description: "Bribes paid to the building_inspector role", createdAt: "2026-03-02T00:00:00Z", updatedAt: "2026-03-02T00:00:00Z" },
];

let auth: Record<string, string>;

beforeAll(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  ({ headers: auth } = await createAccount("MODERATOR"));
  await prisma.report.createMany({
    data: REPORTS.map((r) => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function search(query: string) {
  const res = await api.list(auth, query);
  expect(res.status).toBe(200);
  return res.json() as Promise<{ items: { caseCode: string }[]; page: number; pageSize: number; total: number; totalPages: number }>;
}
const codes = async (query: string) => (await search(query)).items.map((i) => i.caseCode);

describe("GET /api/mod/reports search", () => {
  it("searches description case-insensitively", async () => {
    expect((await codes("?q=procurement")).sort()).toEqual(["WD-AAAA-0002", "WD-CCCC-0005"]);
  });

  it("searches case codes, including partial and lowercase input", async () => {
    expect((await codes("?q=wd-bbbb")).sort()).toEqual(["WD-BBBB-0003", "WD-BBBB-0004"]);
    expect(await codes("?q=0007")).toEqual(["WD-DDDD-0007"]);
  });

  it("treats % and _ in the search text literally", async () => {
    expect(await codes("?q=100%25")).toEqual(["WD-BBBB-0004"]);
    expect(await codes("?q=building_inspector")).toEqual(["WD-DDDD-0007"]);
    expect(await codes("?q=_")).toEqual(["WD-DDDD-0007"]);
  });

  it("returns items with only the list fields", async () => {
    const { items } = await search("?q=0001");
    expect(Object.keys(items[0]).sort()).toEqual(["caseCode", "category", "closedAt", "createdAt", "id", "status", "updatedAt"]);
  });
});

describe("GET /api/mod/reports filters", () => {
  it("filters by a comma-separated list of statuses", async () => {
    expect((await codes("?status=RESOLVED,DISMISSED")).sort()).toEqual(["WD-BBBB-0003", "WD-BBBB-0004"]);
  });

  it("filters by a comma-separated list of categories", async () => {
    expect((await codes("?category=SECURITY,%20TECHNICAL")).sort()).toEqual(["WD-AAAA-0001", "WD-BBBB-0004", "WD-CCCC-0005"]);
  });

  it("combines filters with AND", async () => {
    expect(await codes("?category=CORRUPTION&status=SUBMITTED&q=bribes")).toEqual(["WD-DDDD-0007"]);
    expect(await codes("?category=CORRUPTION&status=RESOLVED")).toEqual([]);
  });

  it("filters createdAt by date range, with date-only bounds covering the whole UTC day", async () => {
    expect((await codes("?from=2026-01-10&to=2026-01-10")).sort()).toEqual(["WD-AAAA-0002", "WD-BBBB-0003"]);
    expect((await codes("?from=2026-03-01")).sort()).toEqual(["WD-CCCC-0006", "WD-DDDD-0007"]);
    expect(await codes("?to=2026-01-09")).toEqual(["WD-AAAA-0001"]);
    expect(await codes(`?from=${encodeURIComponent("2026-01-10T23:00:00+00:00")}&to=2026-01-31`)).toEqual(["WD-BBBB-0003"]);
  });
});

describe("GET /api/mod/reports sorting", () => {
  it("sorts by createdAt descending by default", async () => {
    expect(await codes("")).toEqual([...REPORTS].reverse().map((r) => r.caseCode));
  });

  it("sorts by createdAt ascending", async () => {
    expect(await codes("?sort=createdAt&order=asc")).toEqual(REPORTS.map((r) => r.caseCode));
  });

  it("sorts by updatedAt", async () => {
    expect((await codes("?sort=updatedAt&order=desc")).slice(0, 2)).toEqual(["WD-DDDD-0007", "WD-CCCC-0005"]);
  });

  it("sorts by status in workflow order", async () => {
    const byStatus = (await search("?sort=status&order=asc&pageSize=100")).items as unknown as { status: ReportStatus }[];
    expect(byStatus.map((i) => i.status)).toEqual([
      "SUBMITTED", "SUBMITTED", "SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED", "CLOSED",
    ]);
  });
});

describe("GET /api/mod/reports pagination", () => {
  it("pages through results with totals", async () => {
    const page1 = await search("?sort=createdAt&order=asc&page=1&pageSize=3");
    const page3 = await search("?sort=createdAt&order=asc&page=3&pageSize=3");

    expect(page1).toMatchObject({ page: 1, pageSize: 3, total: 7, totalPages: 3 });
    expect(page1.items.map((i) => i.caseCode)).toEqual(["WD-AAAA-0001", "WD-AAAA-0002", "WD-BBBB-0003"]);
    expect(page3.items.map((i) => i.caseCode)).toEqual(["WD-DDDD-0007"]);
  });

  it("reports totals for the filtered set", async () => {
    expect(await search("?status=SUBMITTED&pageSize=2")).toMatchObject({ total: 3, totalPages: 2 });
  });

  it("returns an empty page past the end", async () => {
    expect(await search("?page=9&pageSize=5")).toMatchObject({ items: [], total: 7, totalPages: 2 });
  });

  it("returns stable, non-overlapping pages when many rows share the sort value", async () => {
    const seen = [];
    for (let page = 1; page <= 4; page++) seen.push(...(await codes(`?sort=status&page=${page}&pageSize=2`)));
    expect(new Set(seen).size).toBe(7);
  });

  it.each([
    ["pageSize over 100", "?pageSize=101"],
    ["page 0", "?page=0"],
    ["an unknown status", "?status=SUBMITTED,ARCHIVED"],
    ["an unknown sort field", "?sort=description"],
    ["a bad order", "?order=up"],
    ["an invalid date", "?from=2026-13-45"],
    ["from after to", "?from=2026-03-01&to=2026-01-01"],
    ["an unknown parameter", "?cursor=abc"],
  ])("rejects %s with 400", async (_label, query) => {
    const res = await api.list(auth, query);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

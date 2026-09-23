import { describe, expect, it } from "vitest";
import { ReportCategory } from "@prisma/client";
import * as server from "@/lib/validation";
import * as client from "@/lib/validation.client";
import { CASE_CODE_PATTERN as SERVER_CASE_CODE_PATTERN, formatCaseCode } from "@/lib/caseCode";
import { CASE_CODE_PATTERN, normalizeCaseCode } from "@/lib/client/caseCode";
import { formatWait } from "@/lib/client/labels";

// The report form validates in the browser with lib/validation.client.ts, a
// copy of the server rules (lib/validation.ts is server-only). These tests
// keep the copy honest.

describe("client validation mirrors the server", () => {
  it("uses the same upload limits and categories", () => {
    expect(client.ALLOWED_UPLOAD_TYPES).toEqual(server.ALLOWED_UPLOAD_TYPES);
    expect(client.MAX_UPLOAD_BYTES).toBe(server.MAX_UPLOAD_BYTES);
    expect(client.MAX_ATTACHMENTS).toBe(server.MAX_ATTACHMENTS);
    expect([...client.REPORT_CATEGORIES].sort()).toEqual(Object.values(ReportCategory).sort());
  });

  const valid = { category: "SECURITY", description: "x".repeat(20) };
  const cases: [string, Record<string, unknown>][] = [
    ["a minimal valid report", valid],
    ["every category", { ...valid, category: "OTHER" }],
    ["an unknown category", { ...valid, category: "FRAUD" }],
    ["no category", { ...valid, category: "" }],
    ["19 characters", { ...valid, description: "x".repeat(19) }],
    ["20 characters padded with spaces", { ...valid, description: `   ${"x".repeat(20)}   ` }],
    ["19 characters padded to 25", { ...valid, description: `   ${"x".repeat(19)}   ` }],
    ["5000 characters", { ...valid, description: "x".repeat(5000) }],
    ["5001 characters", { ...valid, description: "x".repeat(5001) }],
    ["an https link", { ...valid, evidenceUrl: "https://example.org/a?b=c" }],
    ["an http link", { ...valid, evidenceUrl: "http://example.org" }],
    ["a javascript: link", { ...valid, evidenceUrl: "javascript:alert(1)" }],
    ["an ftp link", { ...valid, evidenceUrl: "ftp://example.org/file" }],
    ["not a link", { ...valid, evidenceUrl: "example.org" }],
    ["a 2048-character link", { ...valid, evidenceUrl: `https://example.org/${"a".repeat(2028)}` }],
    ["a 2049-character link", { ...valid, evidenceUrl: `https://example.org/${"a".repeat(2029)}` }],
  ];

  it.each(cases)("agrees on %s", (_, input) => {
    expect(client.reportFormSchema.safeParse(input).success).toBe(server.reportSubmissionSchema.safeParse(input).success);
  });

  it("reports errors against the field they belong to", () => {
    const result = client.reportFormSchema.safeParse({ category: "", description: "short", evidenceUrl: "nope" });
    expect(result.success).toBe(false);
    expect(new Set(result.error!.issues.map((i) => i.path[0]))).toEqual(new Set(["category", "description", "evidenceUrl"]));
  });
});

describe("normalizeCaseCode", () => {
  it("uses the server's format", () => {
    expect(CASE_CODE_PATTERN.source).toBe(SERVER_CASE_CODE_PATTERN.source);
  });

  it.each([
    ["WD-7K2P-Q9XM", "WD-7K2P-Q9XM"],
    ["wd-7k2p-q9xm", "WD-7K2P-Q9XM"],
    ["WD7K2PQ9XM", "WD-7K2P-Q9XM"],
    ["wd7k2pq9xm", "WD-7K2P-Q9XM"],
    ["  wd 7k2p q9xm  ", "WD-7K2P-Q9XM"],
    ["7K2P-Q9XM", "WD-7K2P-Q9XM"],
    ["7k2pq9xm", "WD-7K2P-Q9XM"],
  ])("accepts %j", (input, expected) => {
    expect(normalizeCaseCode(input)).toBe(expected);
  });

  it.each(["", "WD-7K2P", "WD-7K2P-Q9XM1", "XX-7K2P-Q9XM", "7K2P-Q9X"])("rejects %j", (input) => {
    expect(normalizeCaseCode(input)).toBeNull();
  });

  it("round-trips generated codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = formatCaseCode();
      expect(normalizeCaseCode(code.toLowerCase().replaceAll("-", ""))).toBe(code);
    }
  });
});

describe("formatWait", () => {
  it.each([
    [null, "in a few minutes"],
    [1, "in 1 second"],
    [45, "in 45 seconds"],
    [60, "in 1 minute"],
    [61, "in 2 minutes"],
    [3600, "in about 1 hour"],
  ])("%s seconds → %s", (seconds, expected) => {
    expect(formatWait(seconds)).toBe(expected);
  });
});

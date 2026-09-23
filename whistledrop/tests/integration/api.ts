/**
 * Shared helpers for integration tests: call the real route handlers
 * in-process, plus fixtures for moderators, reports and uploads.
 * Test files must mock storage themselves (vi.mock is per file):
 *   vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));
 */
import { NextRequest } from "next/server";
import sharp from "sharp";
import type { ModeratorRole, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST as submitReport } from "@/app/api/reports/route";
import { GET as lookupReport } from "@/app/api/reports/[caseCode]/route";
import { POST as signUpload } from "@/app/api/uploads/sign/route";
import { POST as login } from "@/app/api/mod/login/route";
import { GET as listReports } from "@/app/api/mod/reports/route";
import { GET as getReport } from "@/app/api/mod/reports/[id]/route";
import { PATCH as patchStatus } from "@/app/api/mod/reports/[id]/status/route";
import { GET as getAttachment } from "@/app/api/mod/reports/[id]/attachments/[attachmentId]/route";
import { GET as listModerators, POST as createModerator } from "@/app/api/admin/moderators/route";
import { PATCH as updateModerator } from "@/app/api/admin/moderators/[id]/route";
import { simulateBrowserUpload } from "../helpers/fakeStorage";
import { seedModerator } from "./db";

type Headers = Record<string, string>;

const BASE = "http://localhost";
const JSON_HEADERS = { "content-type": "application/json" };

const jsonRequest = (method: string, path: string, body: unknown, headers: Headers = {}) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: { ...JSON_HEADERS, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const noParams = { params: Promise.resolve({}) };

export const api = {
  submit: (body: unknown, headers: Headers = {}) => submitReport(jsonRequest("POST", "/api/reports", body, headers)),
  lookup: (caseCode: string, ip = "198.51.100.1") =>
    lookupReport(new Request(`${BASE}/api/reports/${caseCode}`, { headers: { "x-forwarded-for": ip } }), {
      params: Promise.resolve({ caseCode }),
    }),
  sign: (body: unknown, headers: Headers = {}) => signUpload(jsonRequest("POST", "/api/uploads/sign", body, headers)),
  login: (body: unknown, headers: Headers = {}) => login(jsonRequest("POST", "/api/mod/login", body, headers)),
  list: (headers: Headers = {}, query = "") =>
    listReports(new NextRequest(`${BASE}/api/mod/reports${query}`, { headers }), noParams),
  get: (id: string, headers: Headers = {}) =>
    getReport(new Request(`${BASE}/api/mod/reports/${id}`, { headers }), { params: Promise.resolve({ id }) }),
  patch: (id: string, body: unknown, headers: Headers = {}) =>
    patchStatus(jsonRequest("PATCH", `/api/mod/reports/${id}/status`, body, headers), {
      params: Promise.resolve({ id }),
    }),
  attachment: (id: string, attachmentId: string, headers: Headers = {}) =>
    getAttachment(new Request(`${BASE}/api/mod/reports/${id}/attachments/${attachmentId}`, { headers }), {
      params: Promise.resolve({ id, attachmentId }),
    }),
  admin: {
    list: (headers: Headers = {}) => listModerators(new Request(`${BASE}/api/admin/moderators`, { headers }), noParams),
    create: (body: unknown, headers: Headers = {}) =>
      createModerator(jsonRequest("POST", "/api/admin/moderators", body, headers), noParams),
    update: (id: string, body: unknown, headers: Headers = {}) =>
      updateModerator(jsonRequest("PATCH", `/api/admin/moderators/${id}`, body, headers), {
        params: Promise.resolve({ id }),
      }),
  },
};

export const validReport = {
  category: "CORRUPTION",
  description: "Procurement contracts are being awarded without competitive bids.",
  evidenceUrl: "https://example.com/evidence.pdf",
};

export async function authHeaders(email: string, password: string): Promise<Headers> {
  const res = await api.login({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const { token } = await res.json();
  return { authorization: `Bearer ${token}` };
}

let accountCounter = 0;
/** Creates an account directly in the database and logs it in. */
export async function createAccount(role: ModeratorRole) {
  const email = `${role.toLowerCase()}${++accountCounter}@example.com`;
  const password = "integration-test-password";
  const { id } = await seedModerator({ email, password, role });
  return { id, email, password, headers: await authHeaders(email, password) };
}

export async function createReport(extra: Record<string, unknown> = {}) {
  const res = await api.submit({ ...validReport, ...extra });
  if (res.status !== 201) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  const { caseCode } = await res.json();
  const { id } = await prisma.report.findUniqueOrThrow({ where: { caseCode }, select: { id: true } });
  return { caseCode, id };
}

/** Walks a report through the given statuses, failing loudly if any step is rejected. */
export async function moveThrough(id: string, statuses: ReportStatus[], headers: Headers) {
  for (const newStatus of statuses) {
    const res = await api.patch(id, { newStatus }, headers);
    if (res.status !== 200) throw new Error(`-> ${newStatus} failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * The browser side of an upload: ask for a signed URL, then "PUT" the bytes to
 * storage. `declaredSize` defaults to the real size.
 */
export async function uploadFile(bytes: Buffer, mimeType: string, declaredSize = bytes.length) {
  const res = await api.sign({ mimeType, sizeBytes: declaredSize });
  if (res.status !== 200) throw new Error(`sign failed: ${res.status} ${await res.text()}`);
  const { uploadToken } = await res.json();
  const [, payload] = uploadToken.split(".");
  const { path } = JSON.parse(Buffer.from(payload, "base64url").toString());
  simulateBrowserUpload(path, bytes, mimeType);
  return { uploadToken: uploadToken as string, stagingPath: path as string };
}

/** EXIF that must never survive: device make/model and GPS position, plus a rotation flag. */
const SENSITIVE_EXIF = {
  IFD0: { Make: "Canon", Model: "EOS R5 SECRET-DEVICE", Software: "fw-1.2" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 1234/100", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 3900/100" },
};

/** A 40x20 image tagged with orientation 6 (rotate 90°) and sensitive EXIF. */
export function imageWithExif(format: "jpeg" | "png" | "webp") {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: "#c33" } })
    .withExif(SENSITIVE_EXIF)
    .withMetadata({ orientation: 6 })
    [format]()
    .toBuffer();
}

export const tinyPdf = () =>
  Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n" +
      "3 0 obj<</Author(Jane Doe)/Producer(SecretCorp PDF)>>endobj\ntrailer<</Root 1 0 R/Info 3 0 R>>\n%%EOF\n",
  );

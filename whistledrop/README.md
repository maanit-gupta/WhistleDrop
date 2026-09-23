# WhistleDrop

An anonymous reporting backend. Anyone can submit a report (security issue, harassment, corruption, technical problem), optionally with evidence files, without an account, and receives a **case code** such as `WD-7K2P-Q9XM`. The case code is the only way back to the report: the reporter uses it to check progress, and moderators move reports through a fixed review workflow that ends with the report being permanently closed and its evidence deleted.

Built with Next.js (App Router route handlers), Prisma, Supabase Postgres and Supabase Storage. There is no frontend in this repository yet; it is the API only.

**Interactive API docs:** [`/api-docs`](http://localhost:3000/api-docs) (Swagger UI, with a working **Authorize** button for moderator tokens). The OpenAPI 3.1 document is at [`/api/openapi`](http://localhost:3000/api/openapi).

## Contents

- [Tech stack](#tech-stack)
- [Setup](#setup)
- [Testing](#testing)
- [API reference](#api-reference)
- [Status workflow](#status-workflow)
- [Evidence upload flow](#evidence-upload-flow)
- [Roles](#roles)
- [How anonymity is maintained](#how-anonymity-is-maintained)
- [Project rules for UI work](#project-rules-for-ui-work)
- [Deployment (Vercel)](#deployment-vercel)
- [Known limitations](#known-limitations)
- [Project structure](#project-structure)

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16, App Router route handlers, TypeScript |
| Database | Supabase Postgres via Prisma 6 (transaction pooler at runtime, session pooler for migrations) |
| File storage | Supabase Storage, private bucket, accessed only server-side with the service role key |
| Image sanitizing | `sharp` (re-encodes images, dropping all metadata) |
| Validation | Zod 4; the OpenAPI spec is generated from the same schemas with `@asteasolutions/zod-to-openapi` |
| Moderator auth | JWT (HS256, 12-hour expiry) via `jose`; passwords hashed with bcrypt (cost 12); account re-checked on every request |
| Rate limiting | `@upstash/ratelimit` sliding windows on Upstash Redis, keyed by a daily-salted HMAC of the IP |
| Tests | Vitest: mocked unit tests + integration tests against a disposable Docker Postgres |

Prisma is pinned to v6 on purpose: the schema uses `url` + `directUrl` in the `datasource` block, which Prisma 7+ no longer supports.

## Setup

**Prerequisites:** Node.js 20.9 or newer, a Supabase project, an Upstash Redis database (production only), and Docker (only for integration tests).

### 1. Install

```bash
npm install          # also runs `prisma generate` and copies Swagger UI's assets into public/api-docs/vendor
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` (git-ignored).

| Variable | Used by | Description |
| --- | --- | --- |
| `DATABASE_URL` | App at runtime | Supavisor **transaction** pooler, port `6543`, with `?pgbouncer=true`. |
| `DIRECT_URL` | Prisma Migrate | **Session** pooler (port `5432`) or direct connection. Migrations can't run through the transaction pooler. |
| `JWT_SECRET` | App at runtime | Signs moderator and upload tokens. At least 32 characters (`openssl rand -base64 48`). Changing it logs out every moderator and voids pending uploads. |
| `IP_HASH_SECRET` | App at runtime | Keys the HMAC used for rate-limit keys. At least 32 characters. Keep it secret: with it, anyone holding the Redis keys could test guesses of IP addresses. |
| `SUPABASE_URL` | App at runtime and build | Project URL, e.g. `https://<ref>.supabase.co`. Also allowed in the CSP's `connect-src` so browsers can upload to Storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | App at runtime (server only) | Service role (or `sb_secret_…`) key. Only `lib/storage.ts` reads it, and that module is `server-only`. **Never** give it a `NEXT_PUBLIC_` prefix. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | App at runtime | Upstash Redis REST credentials (`KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Vercel integration also work). Required in production. |
| `SEED_MODERATOR_EMAIL`, `SEED_MODERATOR_PASSWORD` | Seed script only | The initial **ADMIN** account. |
| `TEST_DATABASE_URL` | Integration tests only (optional) | Overrides the default local Docker test database. |

The `db:*` and `storage:*` scripts load `.env.local` explicitly (via `dotenv-cli`), because the Prisma CLI only reads `.env` on its own.

### 3. Create the schema, the storage bucket and the first admin

```bash
npm run db:deploy       # apply prisma/migrations to Supabase (prisma migrate deploy)
npm run storage:setup   # create/update the private "evidence" bucket (10 MB limit, allowed types only)
npm run db:seed         # create or update the ADMIN from SEED_MODERATOR_* (safe to re-run)
```

To change the schema, edit `prisma/schema.prisma` and create a **new** migration (`npm run db:migrate -- --name <change>`); never edit an applied one.

### 4. Run

```bash
npm run dev          # http://localhost:3000, docs at http://localhost:3000/api-docs
```

Without Upstash credentials, `npm run dev` uses an in-memory rate limiter and logs a warning. A production build refuses to serve rate-limited routes (500) until Upstash is configured.

## Testing

| Command | What it runs |
| --- | --- |
| `npm test` | Unit tests (`tests/*.test.ts`). Prisma, Supabase Storage and Upstash are replaced by in-memory fakes; no database or network needed. |
| `npm run test:db:up` | Starts the disposable test Postgres (`compose.test.yml`, port 54329, data kept in memory). |
| `npm run test:integration` | Integration tests (`tests/integration/`) against that database: real Prisma, real migrations, real transactions and row locks. Supabase Storage is replaced by an in-memory fake (`tests/helpers/fakeStorage.ts`); image sanitizing runs the real `sharp`. |
| `npm run test:db:down` | Stops and discards the test database. |

The integration tests never touch Supabase. They refuse to start unless `TEST_DATABASE_URL` is a **local** host with a database name ending in `_test`. Before each test they truncate the tables, and they check the database name again first. The comment in `tests/integration/globalSetup.ts` explains why this approach was chosen over wrapping each test in a rolled-back transaction.

## API reference

All request and response bodies are JSON. Every API response has `Cache-Control: no-store`. Errors always have this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "description: Too small: expected string to have >=20 characters" } }
```

Moderator and admin routes need `Authorization: Bearer <token>`; the token comes from `POST /api/mod/login`. The full, generated reference with schemas is at **`/api-docs`**.

### Endpoints

| Method | Route | Auth | Request | Success response | Errors |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/uploads/sign` | None (rate limited) | Body: `{ mimeType, sizeBytes }` | `200` `{ uploadUrl, uploadToken, expiresIn }` | `400` · `429` · `500` |
| `POST` | `/api/reports` | None (rate limited) | Body: `{ category, description, evidenceUrl?, attachments? }` | `201` `{ caseCode }` | `400` `BAD_REQUEST`, `VALIDATION_ERROR`, `INVALID_UPLOAD_TOKEN`, `INVALID_UPLOAD` · `409` `UPLOAD_TOKEN_USED` · `429` · `500` |
| `GET` | `/api/reports/:caseCode` | None (rate limited) | Path: case code (case-insensitive) | `200` `{ category, description, evidenceUrl, status, createdAt, statusUpdates: [{ note, newStatus, createdAt }] }` (PUBLIC updates only) | `404` · `429` · `500` |
| `POST` | `/api/mod/login` | None (rate limited) | Body: `{ email, password }` | `200` `{ token, tokenType: "Bearer", expiresIn: 43200 }` | `400` · `401` `INVALID_CREDENTIALS` · `429` · `500` |
| `GET` | `/api/mod/reports` | Bearer (any role) | Query: see [search](#search-and-filtering) | `200` `{ items: [{ id, caseCode, category, status, createdAt, updatedAt, closedAt }], page, pageSize, total, totalPages }` | `400` · `401` · `500` |
| `GET` | `/api/mod/reports/:id` | Bearer (any role) | Path: report id | `200` full report (below) | `401` · `404` · `500` |
| `PATCH` | `/api/mod/reports/:id/status` | Bearer (any role) | Body: `{ newStatus, note?, visibility? }` | `200` full report (below) | `400` · `401` · `404` · `409` `INVALID_TRANSITION`, `CONFLICT` · `423` `REPORT_CLOSED` · `500` |
| `GET` | `/api/mod/reports/:id/attachments/:attachmentId` | Bearer (any role) | Path: report id, attachment id | `200` `{ url, expiresIn: 60, mimeType, sizeBytes }` | `401` · `404` · `500` |
| `GET` | `/api/admin/moderators` | Bearer (ADMIN) | – | `200` `{ items: [{ id, email, role, isActive, createdAt }] }` | `401` · `403` `FORBIDDEN` · `500` |
| `POST` | `/api/admin/moderators` | Bearer (ADMIN) | Body: `{ email, password, role? }` | `201` `{ id, email, role, isActive, createdAt }` | `400` · `401` · `403` · `409` `EMAIL_TAKEN` · `500` |
| `PATCH` | `/api/admin/moderators/:id` | Bearer (ADMIN) | Body: `{ role?, isActive? }` (at least one) | `200` `{ id, email, role, isActive, createdAt }` | `400` · `401` · `403` `FORBIDDEN`, `CANNOT_MODIFY_SELF` · `404` · `409` `LAST_ADMIN` · `500` |
| `GET` | `/api/openapi` | None | – | `200` OpenAPI 3.1 document | – |
| `GET` | `/api-docs` | None | – | Swagger UI (HTML) | – |

### Field rules

| Field | Rule |
| --- | --- |
| `category` | `SECURITY` \| `HARASSMENT` \| `CORRUPTION` \| `TECHNICAL` \| `OTHER` |
| `description` | 20–5000 characters after trimming whitespace |
| `evidenceUrl` | Optional `http`/`https` URL, max 2048 characters |
| `attachments` | Optional array of up to **3** distinct upload tokens from `POST /api/uploads/sign` |
| `mimeType` (upload) | `image/jpeg` \| `image/png` \| `image/webp` \| `application/pdf` |
| `sizeBytes` (upload) | Integer, 1 byte to 10 MB (10,485,760 bytes); must equal the uploaded file's real size |
| `newStatus` | Must be an allowed transition from the current status (see [workflow](#status-workflow)) |
| `note` | Optional, max 2000 characters after trimming |
| `visibility` | `PUBLIC` (default: shown to the reporter) \| `INTERNAL` (moderators only) |
| `email` | Trimmed and lowercased; unique across moderators |
| `password` (new moderator) | 12+ characters, at most 72 bytes (bcrypt's limit) |
| `role` | `ADMIN` \| `MODERATOR` (default `MODERATOR`) |

Request bodies are strict: unknown fields are rejected with `400`, so clients can't send extra data (an email or device id, for example) and have it silently accepted.

**Full report** (moderator routes). `statusUpdates` includes every update, PUBLIC and INTERNAL, with its visibility and the moderator who made it. Attachment storage paths are never returned; use the download endpoint.

```json
{
  "id": "cmue67kg60000x2fp2dv8oigt",
  "caseCode": "WD-7K2P-Q9XM",
  "category": "CORRUPTION",
  "description": "…",
  "evidenceUrl": "https://…",
  "status": "UNDER_REVIEW",
  "createdAt": "2026-09-23T14:10:51.455Z",
  "updatedAt": "2026-09-23T14:11:09.263Z",
  "closedAt": null,
  "statusUpdates": [
    {
      "id": "…",
      "note": "Assigned to audit team",
      "visibility": "INTERNAL",
      "newStatus": "UNDER_REVIEW",
      "createdAt": "…",
      "moderatorId": "…",
      "moderator": { "id": "…", "email": "alice@example.org" }
    }
  ],
  "attachments": [{ "id": "…", "mimeType": "image/jpeg", "sizeBytes": 48213, "createdAt": "…" }]
}
```

`moderatorId` and `moderator` are `null` on updates written before the audit trail existed.

### Search and filtering

`GET /api/mod/reports` query parameters (unknown parameters are rejected with `400`):

| Param | Description | Default |
| --- | --- | --- |
| `q` | Case-insensitive substring search over `description` and `caseCode` (`%` and `_` match literally) | – |
| `status` | Comma-separated list, e.g. `RESOLVED,DISMISSED` | all |
| `category` | Comma-separated list, e.g. `SECURITY,TECHNICAL` | all |
| `from`, `to` | `createdAt` range, inclusive. `YYYY-MM-DD` covers that whole UTC day; full ISO datetimes with an offset are also accepted | – |
| `sort` | `createdAt` \| `updatedAt` \| `status` (workflow order) | `createdAt` |
| `order` | `asc` \| `desc` | `desc` |
| `page` | 1-based page number | `1` |
| `pageSize` | 1–100 | `20` |

Example: `/api/mod/reports?q=procurement&status=SUBMITTED,UNDER_REVIEW&from=2026-01-01&sort=updatedAt&page=2&pageSize=50`

### Error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | The body is not valid JSON. |
| 400 | `VALIDATION_ERROR` | The body or query fails validation. `message` names the first bad field. |
| 400 | `INVALID_UPLOAD_TOKEN` | An upload token is malformed, tampered with, expired (30 minutes), or not an upload token. |
| 400 | `INVALID_UPLOAD` | An uploaded file is missing, its size differs from the declared size or exceeds 10 MB, its bytes don't match the declared type, or the image can't be decoded. |
| 401 | `UNAUTHORIZED` | The token is missing, malformed, expired or has a bad signature, or the account has been deactivated. |
| 401 | `INVALID_CREDENTIALS` | Login failed. The same message is used for an unknown email, a wrong password and a deactivated account. |
| 403 | `FORBIDDEN` | Authenticated, but the route requires the ADMIN role (the role is read from the database on every request). |
| 403 | `CANNOT_MODIFY_SELF` | An admin tried to demote or deactivate their own account. |
| 404 | `NOT_FOUND` | Unknown case code, report, attachment or moderator. A malformed case code gets the identical response, so you can't tell "wrong format" from "doesn't exist". |
| 409 | `INVALID_TRANSITION` | The requested status change isn't allowed from the report's current status. |
| 409 | `CONFLICT` | Another moderator changed the status while this request was running. Reload and retry. |
| 409 | `UPLOAD_TOKEN_USED` | An upload token was already used by another submission. |
| 409 | `EMAIL_TAKEN` | A moderator with that email already exists. |
| 409 | `LAST_ADMIN` | The change would leave no active ADMIN (only reachable when two admins demote or deactivate each other at the same moment). |
| 423 | `REPORT_CLOSED` | The report is CLOSED and read-only: no further status changes or notes. |
| 429 | `RATE_LIMITED` | Too many requests from this client. The `Retry-After` header gives the wait in seconds. |
| 500 | `INTERNAL_ERROR` | Unexpected failure. Always the generic message `Something went wrong`; details are logged on the server only, never returned. |

### Rate limits

Sliding windows per client (see [How anonymity is maintained](#how-anonymity-is-maintained) for how clients are identified without storing IPs):

| Endpoint | Limit |
| --- | --- |
| `GET /api/reports/:caseCode` | 30 per 15 minutes |
| `POST /api/reports` | 10 per hour |
| `POST /api/uploads/sign` | 30 per hour |
| `POST /api/mod/login` | 10 per 15 minutes |

## Status workflow

```
                 moderator                  moderator
  ┌───────────┐  starts review ┌──────────────┐  fixes/acts   ┌──────────┐  archive   ┌────────┐
  │ SUBMITTED │ ─────────────► │ UNDER_REVIEW │ ────────────► │ RESOLVED │ ─────────► │ CLOSED │
  └───────────┘                └──────────────┘               └──────────┘            │        │
   set on                              │                                              │ final, │
   submission                          │  no action needed    ┌───────────┐  archive  │ read-  │
                                       └────────────────────► │ DISMISSED │ ────────► │ only   │
                                                              └───────────┘           └────────┘
                                                                                      closedAt set,
                                                                                      evidence deleted
```

Only these five transitions are allowed. Everything else returns `409 INVALID_TRANSITION`, including skipping review, reopening a resolved or dismissed report, and "changing" a status to itself.

**CLOSED is permanent.** Moving to CLOSED sets `closedAt` and deletes every evidence file of the report from storage, plus its `Attachment` rows. After that, any `PATCH` to the report (status change or note, from any role) returns `423 REPORT_CLOSED`. The report itself, its history and the reporter's case-code lookup remain available.

Files are deleted **before** the report is marked closed. If deleting them fails, the request returns 500, nothing in the database changes, and the close can simply be retried. The opposite order could leave a closed report whose files still exist. Deletion covers the attachment rows' files and anything else under the report's storage folder.

Each accepted transition runs in one `prisma.$transaction`: it updates `Report.status` only if the status is still the one it validated against, inserts the `StatusUpdate` row (with the acting moderator) and, when closing, deletes the attachment rows. When two moderators act at once, exactly one wins; the other gets `409 CONFLICT` (or `423` if the winner closed the report).

## Evidence upload flow

Vercel serverless functions reject request bodies larger than about 4.5 MB, and evidence can be up to 10 MB. So files never pass through this API. The browser uploads them straight to Supabase Storage using a short-lived signed URL, and the API only handles small JSON requests:

```
Browser                          WhistleDrop API                         Supabase Storage (private bucket)
   │ 1. POST /api/uploads/sign          │                                          │
   │    { mimeType, sizeBytes } ───────►│ checks type + size, creates a signed     │
   │                                    │ upload URL for staging/<uuid>.<ext> ────►│
   │ ◄──── { uploadUrl, uploadToken }   │ (uploadToken: JWT with path, type,       │
   │                                    │  size; valid 30 min)                     │
   │ 2. PUT file ─────────────────────────────────────────────────────────────────►│ staging/<uuid>.<ext>
   │                                    │                                          │
   │ 3. POST /api/reports               │                                          │
   │    { …, attachments: [tokens] } ──►│ for each token:                          │
   │                                    │  • verify the JWT (signature, expiry)    │
   │                                    │  • reject tokens already used            │
   │                                    │  • download from staging ◄───────────────│
   │                                    │  • real size == declared size ≤ 10 MB    │
   │                                    │  • magic bytes match the declared type   │
   │                                    │  • images: auto-rotate, re-encode with   │
   │                                    │    sharp (strips ALL metadata)           │
   │                                    │  • PDFs: validated only                  │
   │                                    │  • store as reports/<reportId>/… ───────►│
   │                                    │ one DB transaction: report + attachment  │
   │                                    │ rows + tokens marked used                │
   │ ◄──────────────── { caseCode }     │ then delete the staging copies ─────────►│
```

- **All or nothing:** if any attachment fails (bad token, wrong type, storage error, database error), the files already stored for this submission are deleted and no report, attachment or token record is kept. The staged uploads are left in place, so the reporter can fix the problem and resubmit with the same tokens (until they expire).
- **Single use:** each token's id is recorded in `ConsumedUploadToken` in the same transaction as the report. Reusing a token returns `409 UPLOAD_TOKEN_USED`; if two submissions race with the same token, the primary key lets only one commit, and the loser's files are removed.
- **Downloads:** moderators get a signed URL that **expires after 60 seconds** from `GET /api/mod/reports/:id/attachments/:attachmentId`. The bucket is private; no public URLs exist.
- **Two layers of limits:** Storage itself also enforces the 10 MB limit and the type allowlist (set by `npm run storage:setup`).

Browser example:

```js
const { uploadUrl, uploadToken } = await (await fetch("/api/uploads/sign", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
})).json();
await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
// …then include uploadToken in POST /api/reports { attachments: [uploadToken] }
```

## Roles

| | MODERATOR | ADMIN |
| --- | --- | --- |
| Moderator routes (`/api/mod/*`) | ✓ | ✓ |
| Admin routes (`/api/admin/*`) | `403` | ✓ |

- The seeded account (`npm run db:seed`) is an ADMIN. The migration that introduced roles promoted the existing seeded account to ADMIN; accounts created later default to MODERATOR.
- The JWT carries the role for convenience, but **authorization always uses the database**: every authenticated request re-reads the account, so deactivation and demotion take effect on the very next request, not when the 12-hour token expires.
- An admin can't demote or deactivate themselves (`403 CANNOT_MODIFY_SELF`).
- There is always at least one active admin. Role and active changes lock the active-admin rows, so even two admins demoting each other at the same moment can't leave zero (`409 LAST_ADMIN`).
- Moderators are deactivated, never deleted. The database refuses to delete a moderator who has written status updates, so the audit trail can't be erased.

## How anonymity is maintained

### What is stored

| Table | Columns |
| --- | --- |
| `Report` | `id` (internal), `caseCode`, `category`, `description`, `evidenceUrl`, `status`, `createdAt`, `updatedAt`, `closedAt` |
| `StatusUpdate` | `id`, `reportId`, `note`, `visibility`, `newStatus`, `moderatorId` (the acting **moderator**, never the reporter), `createdAt` |
| `Attachment` | `id`, `reportId`, `storagePath`, `mimeType`, `sizeBytes`, `createdAt` |
| `ConsumedUploadToken` | `jti` (random token id), `consumedAt` |
| `Moderator` | `id`, `email`, `passwordHash`, `role`, `isActive`, `createdAt` |

Storage holds the sanitized evidence files under `reports/<reportId>/` until the report is closed, plus staged uploads under `staging/` (see [Known limitations](#known-limitations)).

### What is never stored

- **No IP address, user agent, cookie, session id, device fingerprint, email, or account** for reporters, in Postgres, in storage metadata or in logs. The submission handler builds database rows only from the validated body fields, and the strict schema rejects any extra field. The unit tests check that request headers never reach the database.
- **No raw IP, anywhere, even for rate limiting.** See below.
- **No image metadata.** Every image is decoded and re-encoded, so EXIF (including GPS coordinates, camera or phone make and model, capture time), XMP, IPTC and embedded comments are gone. The integration tests check this for JPEG, PNG and WebP.
- **No reporter account or login.** The case code is a random bearer token and is linked to nothing else.

### How specific pieces protect reporters

- **Case codes** are 8 characters drawn from 36 (about 2.8 × 10¹² combinations) using `crypto.randomBytes`, with rejection sampling so every character is equally likely. They are not derived from the internal id, time, or content.
- **The internal id is never returned** from the public routes. Reporters only ever see the case code.
- **Lookups don't leak information:** unknown and malformed codes return the identical 404, and lookups are rate limited.
- **Reporters only see PUBLIC notes.** The public lookup filters out INTERNAL updates in the database query, and returns only `note`, `newStatus` and `createdAt` for each update. It never includes ids, visibility, `moderatorId` or any moderator details.
- **Rate-limit keys are daily-salted hashes.** The key is `HMAC-SHA256(ip)`, keyed with `IP_HASH_SECRET` plus the current UTC date, so the same address produces an unrelated key every day and old keys can't be linked to new ones. These hashes exist only in Redis, and expire automatically (after about two windows, at most a few hours). They are never written to Postgres or logged. Upstash analytics is disabled, so no extra copies are kept.
- **Evidence files are private and short-lived.** The bucket has no public URLs. Moderators get 60-second signed links. Files are deleted when the report is closed.
- **Uploads bypass the API.** The file goes straight from the browser to Storage, so the API never sees the file bytes in a request. It reads them back from Storage only to validate and sanitize them.
- **The service role key never reaches a browser.** It is used only in `lib/storage.ts`, which imports `server-only`, so the build fails if it's ever pulled into client code.
- **Logs on reporter routes record only the error type** (for example `PrismaClientKnownRequestError`), never the message, because database error messages can echo submitted content. The rate limiter never logs keys or IPs.
- **Supabase only ever sees the app server connecting to the database.** Row-level security is enabled with no policies on every table, so Supabase's public Data API (anon key) can't read or write anything.
- **Security headers on every route** (set in `next.config.ts`):
  - `Referrer-Policy: no-referrer`: links out of WhistleDrop don't reveal which page the user came from.
  - A strict `Content-Security-Policy`: same-origin scripts, styles, fonts and connections only (plus the Supabase origin for uploads), no inline scripts, no `eval` in production, no plugins, no framing. `/api-docs` is the only exception, and it only adds `'unsafe-inline'` styles and `data:` images, which Swagger UI needs; its scripts remain same-origin.
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and no `X-Powered-By` header.
  - `Cache-Control: no-store` on every API response, so reports aren't kept in browser or proxy caches.

### What this app cannot protect

- **Hosting platform and network logs.** Vercel, CDNs, corporate proxies and ISPs can record the IP that called `/api/reports`, and Supabase Storage can log the IP that uploaded a file through a signed URL. The app stores none of this, but it can't stop the infrastructure from logging. At-risk reporters should use Tor or a trusted VPN, from a device and network that aren't monitored.
- **Report content.** A description, writing style, the content of evidence, or PDF metadata (see below) can identify its author.
- **Timing.** `createdAt` is stored to the millisecond. Someone who can see both platform logs and the database could match the two.
- **Leaked case codes.** Anyone holding a case code can read that report's description, evidence URL and public notes.

## Project rules for UI work

These apply now and to every page added later.

1. **No third-party scripts.** Every script is served from our own origin; no CDNs, tag managers, chat widgets or embeds. (The CSP enforces this: `script-src 'self'`.)
2. **No Vercel Analytics, Speed Insights or any other analytics on reporter-facing pages.** Even aggregated analytics add network requests and fingerprinting surface on the pages where anonymity matters most.
3. **Fonts only through `next/font`**, which self-hosts them at build time. Never link Google Fonts or any other font CDN (the CSP's `font-src 'self'` blocks them anyway).
4. **Evidence URLs rendered as links** must use `rel="noopener noreferrer"` and `target="_blank"`, and must show a **"You're leaving WhistleDrop"** warning first, naming the destination domain and noting that the other site can see the visitor's IP address. Never auto-fetch, preview or unfurl an evidence URL.
5. **Next.js pages and the CSP:** Next.js embeds small inline bootstrap scripts in every page it renders. The strict `script-src 'self'` policy set for all routes blocks them. Before building the UI, move the page CSP to per-request nonces in `proxy.ts`, the approach in the Next.js CSP guide (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). Do this rather than adding `'unsafe-inline'`.

## Deployment (Vercel)

1. From a trusted machine (or CI), run `npm run db:deploy` against production before deploying code that depends on a new migration. Run `npm run storage:setup` once per Supabase project.
2. Set these environment variables in the Vercel project (**Settings → Environment Variables**):

   | Name | Required | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | Yes | Transaction pooler URL (port 6543, `?pgbouncer=true`). |
   | `JWT_SECRET` | Yes | Use a different value from local development. |
   | `IP_HASH_SECRET` | Yes | Use a different value from local development. |
   | `SUPABASE_URL` | Yes | Also read at **build** time for the CSP, so set it for the build environment too. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only secret. |
   | `UPSTASH_REDIS_REST_URL` | Yes | Or `KV_REST_API_URL` from the Vercel Upstash integration. |
   | `UPSTASH_REDIS_REST_TOKEN` | Yes | Or `KV_REST_API_TOKEN`. |
   | `DIRECT_URL` | Only if migrations run on Vercel | Only Prisma Migrate uses it. |

   `SEED_MODERATOR_EMAIL` / `SEED_MODERATOR_PASSWORD` are **not** needed on Vercel; seeding is a one-off run from a trusted machine. `TEST_DATABASE_URL` is for local tests only.

3. Deploy the functions in the same region as the database (this project's Supabase is in `ap-southeast-2`, so Vercel region `syd1`), and create the Upstash database in the same region. Every query is a network round trip, and a status change makes several in one transaction.

`npm install` runs `prisma generate` and copies Swagger UI's assets through the `postinstall` hook, so both happen on Vercel automatically.

## Known limitations

These are deliberate tradeoffs, listed so nobody relies on something the code doesn't do.

- **PDF metadata is not stripped.** PDFs are only checked for type and size; author, producer, creation tool, timestamps, and any embedded content or hidden text stay exactly as uploaded. Reporters should remove PDF metadata themselves, for example by printing to a new PDF or exporting it as images, before uploading.
- **Upload staging files can be orphaned.** If a reporter uploads a file but never submits the report, the staged copy stays in `staging/` in the bucket. There is no automatic cleanup yet; a scheduled job should delete staging objects older than the 30-minute token lifetime.
- **The rate limiter fails open when Redis is slow.** If Upstash doesn't answer within 3 seconds, the request is allowed, so an outage never stops people reporting. Errors other than timeouts (for example bad credentials) fail closed with a 500.
- **Rate-limit windows reset at UTC midnight.** Because the IP hash's salt rotates daily, a client's counts start fresh at 00:00 UTC.
- **The rate limiter trusts `X-Forwarded-For`.** That's correct behind Vercel's proxy, which sets the header. If the app is exposed directly, clients can forge the header to dodge the limits.
- **Shared IPs share limits.** Everyone behind one NAT (an office, a campus, a Tor exit node) shares a single budget, so heavy use by others can block a legitimate reporter for a while.
- **Moderator tokens aren't revocable one by one.** Deactivation blocks a moderator immediately, but there is no "log out everywhere" for an active account short of rotating `JWT_SECRET`.
- **Search is a plain substring scan** (`ILIKE '%…%'`). That's fine at this scale; a large dataset would need a `pg_trgm` index or full-text search.
- **Case codes are fairly short.** About 41 bits of randomness is plenty against rate-limited online guessing, but weaker than a long random token if the limiter is bypassed (see `X-Forwarded-For` above).
- **Next.js pages need nonce-based CSP** before any UI ships (see [rule 5](#project-rules-for-ui-work)).
- **The package.json seed setting is deprecated.** Prisma warns about the `package.json#prisma.seed` config. It works on the pinned Prisma 6, and moves to `prisma.config.ts` when upgrading to Prisma 7.

## Project structure

```
app/
  api/reports/route.ts                                   POST   submit a report (+ attachments)
  api/reports/[caseCode]/route.ts                        GET    reporter lookup (PUBLIC updates only)
  api/uploads/sign/route.ts                              POST   signed upload URL + upload token
  api/mod/login/route.ts                                 POST   moderator login
  api/mod/reports/route.ts                               GET    search / filter / paginate
  api/mod/reports/[id]/route.ts                          GET    one report with full history
  api/mod/reports/[id]/status/route.ts                   PATCH  change status (transactional, closes + purges)
  api/mod/reports/[id]/attachments/[attachmentId]/route.ts  GET 60-second signed download URL
  api/admin/moderators/route.ts                          GET/POST list / create moderators
  api/admin/moderators/[id]/route.ts                     PATCH  role / isActive
  api/openapi/route.ts                                   GET    OpenAPI document
  api-docs/route.ts                                      GET    Swagger UI
lib/
  db.ts            Prisma client singleton
  caseCode.ts      case code generation (crypto.randomBytes)
  auth.ts          JWT sign/verify for moderator and upload tokens (Edge-compatible)
  guards.ts        withModerator / withAdmin route guards (database-checked)
  validation.ts    Zod schemas + transition rules (the single source for the OpenAPI spec)
  openapi.ts       OpenAPI registry and document
  zodOpenApi.ts    enables .openapi() on Zod before any schema is created
  reports.ts       moderator report-detail shape
  uploads.ts       magic-byte checks, sharp sanitizing, attachment storage with rollback
  storage.ts       server-only Supabase Storage client (service role)
  rateLimit.ts     Upstash sliding-window limiter, hashed-IP keys, in-memory test fallback
  apiResponse.ts   JSON success/error helpers
prisma/
  schema.prisma, migrations/, seed.ts
scripts/
  setup-storage.ts     creates the private evidence bucket
  copy-swagger-ui.mjs  copies Swagger UI assets into public/ on install
public/api-docs/init.js   Swagger UI bootstrap (a file, so no inline script is needed)
tests/
  *.test.ts                unit tests (mocked Prisma / Storage / Upstash)
  integration/             integration tests (Docker Postgres, fake Storage)
  helpers/                 fake Storage, server-only stub
compose.test.yml           disposable test database
```

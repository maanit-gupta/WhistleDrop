# Frontend ↔ API contract

What the WhistleDrop API actually does, read from `app/api/**` and `lib/**`
(September 2026). The frontend builds against this file only. If a page needs
something that isn't here, the backend has to change first; don't guess.

Typed client: `lib/client/api.ts`, one function per endpoint below. Request
types come from the Zod schemas in `lib/validation.ts` and response types from
the schemas in `lib/openapi.ts`, all via `import type` + `z.infer` / `z.input`.

## Conventions (every endpoint)

| Topic | What the code does |
| --- | --- |
| Success body | The resource as JSON, no envelope. Dates are ISO-8601 strings. |
| Error body | `{ "error": { "code": string, "message": string } }`. **There is no `details` field**; validation errors put the first Zod issue into `message` as `"<path>: <issue>"`. |
| Caching | Every API response has `Cache-Control: no-store`. |
| Auth | `/api/mod/*` (except `/api/mod/login`) and `/api/admin/*`: `Authorization: Bearer <jwt>`. The server re-reads the moderator from the database on every request, so deactivation and role changes apply at once. |
| Rate limits | Per client IP (HMAC'd daily, never stored raw), sliding window; the reporter message limit is per IP **and** case code. Exceeded → `429 RATE_LIMITED` with `Retry-After: <seconds>`. |
| Rate limiter missing | Production without Upstash → `503 RATE_LIMITER_UNAVAILABLE` on the six rate-limited endpoints (every public endpoint plus login). |
| Unexpected failure | `500 INTERNAL_ERROR`, message `"Something went wrong"`. No details ever. |
| Malformed JSON | `400 BAD_REQUEST`. |
| Invalid input | `400 VALIDATION_ERROR`. Request schemas are `.strict()`: unknown keys are rejected. |

Status codes used anywhere: 200, 201, 400, 401, 403, 404, 409, 423, 429, 500, 503.
**No endpoint returns 410.** The client still exposes whatever status arrives.

Enums (Prisma):

- `ReportCategory`: `SECURITY | HARASSMENT | CORRUPTION | TECHNICAL | OTHER`
- `ReportStatus`: `SUBMITTED | UNDER_REVIEW | RESOLVED | DISMISSED | CLOSED`
- `NoteVisibility`: `PUBLIC | INTERNAL`
- `ModeratorRole`: `ADMIN | MODERATOR`
- `MessageAuthorType` (storage only): `REPORTER | MODERATOR`. The API never sends it: the reporter sees `author: "REPORTER" | "REVIEW_TEAM"`.

## Public endpoints (no auth)

### `POST /api/reports`: submit a report

Rate limit: 10 per hour.

| | Shape |
| --- | --- |
| Request | `{ category: ReportCategory, description: string (trimmed, 20–5000), evidenceUrl?: http(s) URL ≤ 2048, attachments?: string[] (upload tokens, ≤ 3, unique, each 1–4096 chars) }` |
| 201 | `{ caseCode: string }` (format `WD-XXXX-XXXX`, A–Z 0–9) |

| Status | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Body isn't JSON |
| 400 | `VALIDATION_ERROR` | Schema failure (including duplicate tokens) |
| 400 | `INVALID_UPLOAD_TOKEN` | A token is invalid or expired (30 min lifetime) |
| 400 | `INVALID_UPLOAD` | File missing from storage, size ≠ declared, bytes ≠ declared type, over 10 MB, or image can't be processed |
| 409 | `UPLOAD_TOKEN_USED` | A token was already used, including by a concurrent submission |
| 429 | `RATE_LIMITED` | + `Retry-After` |
| 503 | `RATE_LIMITER_UNAVAILABLE` | |
| 500 | `INTERNAL_ERROR` | |

All or nothing: if any attachment fails, no report is created.

### `POST /api/reports/lookup`: look up a report (use this one)

Rate limit: 30 per 15 minutes, counted before validation, shared with the GET form below.
The server trims and upper-cases the code. The code is in the **body**, so it never appears in a URL
or in the hosting platform's request logs.

| | Shape |
| --- | --- |
| Request | `{ caseCode: string (≤ 64) }` |
| 200 | `PublicReport` (below) |

`PublicReport` = `{ category, description, evidenceUrl: string | null, status, createdAt, statusUpdates, conversation }`

- `statusUpdates: { note: string | null, newStatus, createdAt }[]`: PUBLIC updates only, oldest first. Kept for compatibility.
- `conversation`: oldest first, one list merging
  - messages: `{ type: "message", author: "REPORTER" | "REVIEW_TEAM", body, createdAt }`
  - every status change: `{ type: "status", status, note?, createdAt }`; `note` only when that change had a PUBLIC note.

  Never any ids, moderator ids or emails, visibility flags or INTERNAL notes. Returned for CLOSED cases too.

| Status | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | Body isn't JSON, `caseCode` isn't a string, or extra keys |
| 404 | `NOT_FOUND` | Unknown **or** malformed code (identical responses, `"Report not found"`) |
| 429 | `RATE_LIMITED` | + `Retry-After` |
| 503 / 500 | | as above |

### `GET /api/reports/{caseCode}`: the same lookup (compatibility only)

Identical response and rate limit bucket, but the code is in the path, where hosting request logs
can record it. The UI doesn't use it.

### `POST /api/reports/messages`: the reporter replies

Rate limits: 10 per hour per client **and case code** (`reporterMessage`), and each request also counts
against the 30-per-15-minutes lookup budget (a wrong code answers 404, so this is also a lookup).

| | Shape |
| --- | --- |
| Request | `{ caseCode: string (≤ 64), body: string (trimmed, 1–2000; line breaks kept) }` |
| 201 | `{ conversation }` (same shape as in `PublicReport`), including the new message |

Creates a `REPORTER` message and sets the case's `awaitingReply`. Nothing about the sender is stored.

| Status | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | Body isn't JSON, empty or too long `body`, extra keys |
| 404 | `NOT_FOUND` | Unknown or malformed code: the lookup's exact 404 |
| 423 | `REPORT_CLOSED` | `"This case is closed. The conversation is read-only."` |
| 429 | `RATE_LIMITED` | + `Retry-After` (either limit) |
| 503 / 500 | | as above |

### `POST /api/uploads/sign`: get a signed upload URL for one file

Rate limit: 30 per hour.

| | Shape |
| --- | --- |
| Request | `{ mimeType: "image/jpeg" \| "image/png" \| "image/webp" \| "application/pdf", sizeBytes: int 1–10485760 }` |
| 200 | `{ uploadUrl: string (Supabase Storage, absolute), uploadToken: string (JWT), expiresIn: 1800 }` |

Errors: `400 BAD_REQUEST / VALIDATION_ERROR`, `429`, `503`, `500`.

Then the browser uploads the file **directly to Supabase** (`PUT uploadUrl`,
not through this API), and puts `uploadToken` in `POST /api/reports`
`attachments` within 30 minutes. `lib/client/api.ts` → `uploadToSignedUrl`
sends the same request `supabase-js` `uploadToSignedUrl` would
(multipart body: `cacheControl` field plus the file under an empty field
name, `x-upsert: false`), with progress via XHR. This is the one
cross-origin request the UI makes. The server re-checks the file's real type
and size and strips image metadata when the report is submitted.

## Moderator auth

### `POST /api/mod/login`

Rate limit: 10 per 15 minutes.

| | Shape |
| --- | --- |
| Request | `{ email: string (trimmed, lower-cased, email), password: string 1–256 }` |
| 200 | `{ token: string, tokenType: "Bearer", expiresIn: 43200 }` |

| Status | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password, **or** deactivated account (same message) |
| 429 / 503 / 500 | | |

**Role in the token: yes.** The login *response body* has no role, but the JWT
(HS256, issuer `whistledrop`, audience `whistledrop:moderator`, 12 h expiry)
carries these claims: `sub` (moderator id), `email`, `role` (`ADMIN` |
`MODERATOR`), `iat`, `exp`. The UI decodes it with `jose` `decodeJwt` (no
signature check) **only** to decide what to show. The server never trusts
the token's role: guards re-read role and `isActive` from the database on
every request. A role changed after login shows up as a 403 until the
moderator signs in again.

## Moderator endpoints (Bearer token, any active role)

Shared failures for every endpoint in this section and the admin section:
`401 UNAUTHORIZED` (missing, invalid or expired token, account deleted or deactivated),
`500 INTERNAL_ERROR` (including a failed auth lookup).

### `GET /api/mod/reports`: search, filter, paginate

Query (strict, so unknown params give 400):

| Param | Format | Default |
| --- | --- | --- |
| `q` | string 1–200 (trimmed); case-insensitive substring of description **or** caseCode | none |
| `status` | CSV of `ReportStatus`, e.g. `SUBMITTED,UNDER_REVIEW` | none |
| `category` | CSV of `ReportCategory` | none |
| `from` / `to` | `YYYY-MM-DD` (whole UTC day) or ISO datetime with offset; `from ≤ to` | none |
| `sort` | `createdAt \| updatedAt \| status` | `createdAt` |
| `order` | `asc \| desc` | `desc` |
| `page` | int 1–10000 | 1 |
| `pageSize` | int 1–100 | 20 |
| `awaitingReply` | `true \| false` | none (both) |

200: `{ items: { id, caseCode, category, status, createdAt, updatedAt, closedAt: string | null, awaitingReply: boolean }[], page, pageSize, total, totalPages }`

Errors: `400 VALIDATION_ERROR`, `401`, `500`.

### `GET /api/mod/reports/{id}`: one report with its full history

200 (`ReportDetail`): `{ id, caseCode, category, description, evidenceUrl: string | null, status, createdAt, updatedAt, closedAt: string | null, awaitingReply: boolean, statusUpdates: { id, note: string | null, visibility, newStatus, createdAt, moderatorId: string | null, moderator: { id, email } | null }[], attachments: { id, mimeType, sizeBytes, createdAt }[], conversation, internalNotes }`

- `conversation`: exactly what the reporter sees, plus who wrote it:
  `{ type: "message", id, author: "REPORTER" | "REVIEW_TEAM", body, createdAt, moderator: { id, email } | null }` and
  `{ type: "status", id, status, note?, visibility, createdAt, moderator }` (`note` only when PUBLIC, as for the reporter).
- `internalNotes`: staff only: `{ type: "note" | "status", id, status?, note: string | null, createdAt, moderator }`,
  i.e. internal notes and INTERNAL status updates (with their notes).

Everything is oldest first; storage paths are never returned.

Errors: `404 NOT_FOUND` (unknown or non-cuid id), `401`, `500`.

### `PATCH /api/mod/reports/{id}/status`: change status

| | Shape |
| --- | --- |
| Request | `{ newStatus: ReportStatus, note?: string (trimmed, ≤ 2000), visibility?: "PUBLIC" \| "INTERNAL" }` (visibility defaults to PUBLIC and applies to the note: the status change always shows in the reporter's conversation, the note only if PUBLIC) |
| 200 | Updated `ReportDetail` (same shape as GET) |

| Status | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | |
| 404 | `NOT_FOUND` | |
| 409 | `INVALID_TRANSITION` | Not allowed from the current status (message names both) |
| 409 | `CONFLICT` | Another moderator changed the status in the meantime; reload |
| 423 | `REPORT_CLOSED` | The report is CLOSED (read-only), checked before the transition |
| 401 / 500 | | |

Transitions (single source: `lib/transitions.shared.ts`, used by this route and the UI):

```
SUBMITTED → UNDER_REVIEW → RESOLVED  → CLOSED
                         → DISMISSED → CLOSED
```

Moving to CLOSED **permanently deletes every evidence file** before the status
changes, sets `closedAt` and clears `awaitingReply`. The conversation stays readable by the reporter.
The UI must say so before confirming.

### `POST /api/mod/reports/{id}/messages`: reply to the reporter

| | Shape |
| --- | --- |
| Request | `{ body: string (trimmed, 1–2000) }` |
| 201 | Updated `ReportDetail` |

The reporter sees it as `REVIEW_TEAM`; the acting moderator is recorded for staff. Clears `awaitingReply`.
Errors: `400`, `401`, `404 NOT_FOUND`, `423 REPORT_CLOSED` (`"This case is closed. The conversation is read-only."`), `500`.

### `POST /api/mod/reports/{id}/notes`: internal note

| | Shape |
| --- | --- |
| Request | `{ body: string (trimmed, 1–2000) }`; there is **no** visibility option (sending one is a 400) |
| 201 | Updated `ReportDetail` |

Always INTERNAL, never shown to the reporter; doesn't change `awaitingReply`. Anything for the reporter goes
through `/messages`. Errors: `400`, `401`, `404`, `423 REPORT_CLOSED`, `500`.

### `GET /api/mod/reports/{id}/attachments/{attachmentId}`: download link

200: `{ url: string (signed, Content-Disposition: attachment), expiresIn: 60, mimeType: string, sizeBytes: number }`
Errors: `404 NOT_FOUND` (bad ids, or attachment not on that report), `401`, `500`.
The link expires after 60 s, so request it on click, never ahead of time.

## Admin endpoints (Bearer token, role ADMIN)

Also: `403 FORBIDDEN` when the caller is authenticated but not ADMIN.

`Moderator` = `{ id, email, role, isActive, isDemo, createdAt }` (never the password hash).

Demo accounts (`isDemo: true`, credentials public in `DUMMY_SIGN_INS.txt`) are enforced on the server:
nobody can change a demo account's role or active status, a demo account can't change any other
account's role or active status, and a demo account can only create MODERATOR accounts.

### `GET /api/admin/moderators`

200: `{ items: Moderator[] }` (oldest first). Errors: `401`, `403`, `500`.

### `POST /api/admin/moderators`

| | Shape |
| --- | --- |
| Request | `{ email: string (trimmed, lower-cased, email), password: string (≥ 12 chars, ≤ 72 UTF-8 bytes), role?: ModeratorRole (default MODERATOR) }` |
| 201 | `Moderator` |

Errors: `400 BAD_REQUEST / VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `401`, `403 FORBIDDEN`, `403 DEMO_ACCOUNT_RESTRICTED` (a demo account creating an ADMIN), `500`.

### `PATCH /api/admin/moderators/{id}`

| | Shape |
| --- | --- |
| Request | `{ role?: ModeratorRole, isActive?: boolean }` (at least one) |
| 200 | `Moderator` |

| Status | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | |
| 403 | `CANNOT_MODIFY_SELF` | Demoting or deactivating your own account |
| 403 | `DEMO_ACCOUNT_PROTECTED` | Changing a demo account's role or active status |
| 403 | `DEMO_ACCOUNT_RESTRICTED` | A demo account changing another account's role or active status |
| 403 | `FORBIDDEN` | Not ADMIN (or lost ADMIN while the request waited) |
| 404 | `NOT_FOUND` | Unknown or non-cuid id |
| 409 | `LAST_ADMIN` | Would leave no active ADMIN |
| 401 / 500 | | |

There is **no delete endpoint**: moderators are deactivated, never deleted.

## Not for the UI

| Endpoint | Why |
| --- | --- |
| `GET /api/cron/cleanup` | Vercel Cron only (`Bearer $CRON_SECRET`). Also restores demo accounts (active, original roles). |
| `GET /api/openapi`, `/api-docs` | API documentation |

## Where this differs from the Part 1 brief

- Error bodies have **no `details`** field. The client parses `code` and `message` only.
- **No endpoint returns 410**, and nothing expires reports. `423 REPORT_CLOSED` is the "gone/read-only" signal.
- `503 RATE_LIMITER_UNAVAILABLE` exists and wasn't in the brief; the client passes it through like any other status.
- Login returns no role in the body; it's in the JWT (see above).
- Upload limits (`ALLOWED_UPLOAD_TYPES`, `MAX_UPLOAD_BYTES`, `MAX_ATTACHMENTS`) live in the server-only `lib/validation.ts`. The client can import their *types* but not their values; the dropzone takes them as props.

## Moderator UI notes (Part 3)

- No backend changes were needed: `GET /api/mod/reports/{id}` already returns attachments
  (`id, mimeType, sizeBytes, createdAt`, no URLs or paths) and each update's `visibility` and
  `moderator.email`.
- The dashboard's counts come from `GET /api/mod/reports?status=…&pageSize=1` (and `category=…`),
  one request each, in parallel, reading `total`. There is no stats endpoint.
- The attachment "View" button treats **404 as well as 410** as "Evidence purged": this API never
  sends 410, and a 404 for an attachment the page just listed means its row was deleted (the case
  was closed in the meantime).
- The reports page keeps filters in its query string (including `awaitingReply=true`), except the search
  text (`q`), which can be a case code and so stays in memory only.

## Conversation UI notes

- `/track` keeps the case code in component state only and sends it in request bodies
  (`POST /api/reports/lookup`, `POST /api/reports/messages`). After sending, the thread is replaced with
  the `conversation` from the 201 response, so no extra lookup is spent.
- The thread is a `StatusTimeline`: a synthetic "Submitted" entry from `createdAt`, then each
  conversation entry. `REVIEW_TEAM` → lime eyebrow "Review team", `REPORTER` → muted "You", status events →
  the status label with the PUBLIC note. A 423 while sending switches to the read-only notice.
- The report page shows `conversation` and `internalNotes` in separate blocks with separate composers:
  the reply uses the lime `SubmitButton`, the internal note an outlined `BlockCTA` in a dashed frame.
- The dashboard's "Awaiting Reply" count is `GET /api/mod/reports?awaitingReply=true&pageSize=1` → `total`.

## Open issues

1. ~~Case code in the lookup URL path.~~ Resolved: the UI uses `POST /api/reports/lookup`. The GET
   route remains only for API compatibility.
2. **No description in the report list.** `GET /api/mod/reports` items have no `description`, so the
   reports table can't show a description preview without one extra request per row. Adding a
   truncated `description` (e.g. the first 160 characters) to the list's `select` would fix it.

# WhistleDrop

**Speak without being seen.** An anonymous reporting service: submit a report with no account, get a case code only you hold, and follow your case as moderators review it.

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Prisma 6](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Storage-3ecf8e?logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6e9f18?logo=vitest&logoColor=white)

- **Live app:** <LIVE_URL>
- **Interactive API docs (Swagger UI):** <LIVE_URL>/api-docs
- **Source:** https://github.com/maanit-gupta/WhistleDrop
- **Try it as a moderator:** public demo accounts and sample case codes are in [`DUMMY_SIGN_INS.txt`](DUMMY_SIGN_INS.txt) (see [Demo accounts](#demo-accounts)).

## Contents

1. [Overview](#overview)
2. [Screenshots](#screenshots)
3. [Features](#features)
4. [Tech stack](#tech-stack)
5. [Architecture](#architecture)
6. [Status workflow](#status-workflow)
7. [The conversation model](#the-conversation-model)
8. [How anonymity is maintained](#how-anonymity-is-maintained)
9. [Security decisions](#security-decisions)
10. [Evidence upload flow](#evidence-upload-flow)
11. [API reference](#api-reference)
12. [Example requests: a full case lifecycle](#example-requests-a-full-case-lifecycle)
13. [Local setup](#local-setup)
14. [Testing](#testing)
15. [Deployment (Vercel)](#deployment-vercel)
16. [Demo accounts](#demo-accounts)
17. [Design decisions and assumptions](#design-decisions-and-assumptions)
18. [Known limitations](#known-limitations)
19. [Future improvements](#future-improvements)
20. [Acknowledgements](#acknowledgements)

## Overview

WhistleDrop is my submission for the GDG on Campus SRM Technical Domain brief, **"WhistleDrop — Speak Without Being Seen"**. People who witness wrongdoing (a security hole, harassment, corruption, a technical fault) often stay quiet because reporting it could expose them. The brief asks for a platform where anyone can report an issue anonymously, follow what happens to it, and where a moderation team can review and act on reports without ever learning who sent them.

**For reporters**, WhistleDrop needs no account, no email and no login. A reporter picks a category, describes the issue, and can optionally add a link and up to three evidence files (images or PDFs). They get back a case code such as `WD-7K2P-Q9XM`. That code is the only way back to the report: entering it on the Track page shows the current status and an anonymous conversation with the review team, where the reporter can answer questions and add details. Nothing links the code to the person who holds it.

**For moderators**, there is a signed-in area at `/mod` with a dashboard of case counts, a searchable and filterable list of reports, and a detail page for each report. There they can download evidence through short-lived links, move the case through a fixed workflow, reply to the reporter (who only ever sees "the review team"), and keep staff-only internal notes. Admins also manage moderator accounts. When a case is finished it is closed permanently and its evidence files are deleted.

## Screenshots

Captured from the production build by `npm run screenshots` at 1440 px (desktop) and 390 px (mobile). Full-size images are in [`docs/screenshots/`](docs/screenshots/).

### Reporter

**Home**

<p>
  <img src="docs/screenshots/01-home-desktop.png" alt="Home page, desktop" width="640">
  <img src="docs/screenshots/01-home-mobile.png" alt="Home page, mobile" width="200">
</p>

**Make a report**

<p>
  <img src="docs/screenshots/02-report-desktop.png" alt="Report form, desktop" width="640">
  <img src="docs/screenshots/02-report-mobile.png" alt="Report form, mobile" width="200">
</p>

**Case code screen** (shown once, straight after submitting)

<p>
  <img src="docs/screenshots/03-case-code-desktop.png" alt="Case code screen, desktop" width="640">
  <img src="docs/screenshots/03-case-code-mobile.png" alt="Case code screen, mobile" width="200">
</p>

**Track a case**

<p>
  <img src="docs/screenshots/04-track-desktop.png" alt="Track a case with a result, desktop" width="640">
  <img src="docs/screenshots/04-track-mobile.png" alt="Track a case with a result, mobile" width="200">
</p>

### Moderator

**Sign in**

<p>
  <img src="docs/screenshots/05-mod-login-desktop.png" alt="Moderator sign-in, desktop" width="640">
  <img src="docs/screenshots/05-mod-login-mobile.png" alt="Moderator sign-in, mobile" width="200">
</p>

**Dashboard**

<p>
  <img src="docs/screenshots/06-dashboard-desktop.png" alt="Moderator dashboard, desktop" width="640">
  <img src="docs/screenshots/06-dashboard-mobile.png" alt="Moderator dashboard, mobile" width="200">
</p>

**Reports list with search and filters**

<p>
  <img src="docs/screenshots/07-reports-desktop.png" alt="Reports list, desktop" width="640">
  <img src="docs/screenshots/07-reports-mobile.png" alt="Reports list, mobile" width="200">
</p>

**Report detail**

<p>
  <img src="docs/screenshots/08-report-detail-desktop.png" alt="Report detail, desktop" width="640">
  <img src="docs/screenshots/08-report-detail-mobile.png" alt="Report detail, mobile" width="200">
</p>

**Moderator management (admins only)**

<p>
  <img src="docs/screenshots/09-moderators-desktop.png" alt="Moderator management, desktop" width="640">
  <img src="docs/screenshots/09-moderators-mobile.png" alt="Moderator management, mobile" width="200">
</p>

## Features

### Core requirements

- **Anonymous submission.** A report has a category (Security, Harassment, Corruption, Technical, Other), a description of 20 to 5,000 characters, and an optional `http`/`https` evidence link. No account, name, email or contact detail is asked for or accepted.
- **Case code.** Each submission returns a random code in the form `WD-XXXX-XXXX`. The reporter can copy it or download it as a text file. It is shown once and is never put in a URL or browser storage.
- **Case tracking.** Entering the code on `/track` shows the category, description, current status and the conversation with the review team: messages, every status change and any PUBLIC note. The input accepts lowercase, spaces, missing dashes and a missing `WD` prefix.
- **Anonymous two-way conversation.** The reporter can reply from `/track` (1 to 2,000 characters, line breaks kept); moderators reply from the report page. Moderators appear to the reporter only as "Review team", and a message stores its text and nothing about the sender. Internal notes are a separate, staff-only channel. See [The conversation model](#the-conversation-model).
- **Moderator login.** Email and password, returning a 12-hour bearer token.
- **Status updates with notes.** Moderators move reports through `SUBMITTED → UNDER_REVIEW → RESOLVED | DISMISSED → CLOSED`, optionally with a note on each change (PUBLIC, shown in the conversation, or INTERNAL).

### Brownie points implemented

- **Moderator and admin dashboard.** A signed-in area with case counts by status and category, an "Awaiting Reply" count for cases where the reporter wrote last, recent reports, a full reports list, a report detail page and, for admins, moderator management (create accounts, change roles, deactivate and reactivate). Roles are `ADMIN` and `MODERATOR`.
- **Permanent closure.** `CLOSED` is terminal and read-only. Closing deletes every evidence file for the report, and any later change is refused with `423 REPORT_CLOSED`.
- **Extra privacy protections.** Daily-rotating hashed IPs used only as rate-limit keys, EXIF stripping, a conversation that stores nothing about the reporter, staff-only internal notes, case codes sent in request bodies rather than URLs, row-level security lockdown, nonce-based CSP, `no-referrer`, a warning before every outbound link, a quick-exit button, no analytics and self-hosted fonts. See [How anonymity is maintained](#how-anonymity-is-maintained).
- **Evidence upload.** Up to three JPEG, PNG, WebP or PDF files of up to 10 MB each, uploaded straight to a private Supabase Storage bucket, checked by magic bytes, and (for images) re-encoded to remove metadata.
- **Search and advanced filtering.** Case-insensitive search over description and case code, multi-select status and category filters, a created-at date range, an "Awaiting reply" filter (rows show a REPLY tag), sorting by created, updated or status, and pagination.
- **Public demo accounts.** An admin and two moderators whose credentials are published in [`DUMMY_SIGN_INS.txt`](DUMMY_SIGN_INS.txt), locked down on the server, plus five sample cases. See [Demo accounts](#demo-accounts).
- **Swagger / OpenAPI.** An OpenAPI 3.1 document generated from the same Zod schemas the API validates with, served at `/api/openapi` and rendered by Swagger UI at `/api-docs`, with a working **Authorize** button for moderator tokens.
- **Automated tests.** Unit tests with mocked dependencies, integration tests against a real disposable Postgres, and end-to-end CSP tests against the production build.
- **Deployment.** Configured for Vercel, with a daily cleanup cron job.

## Tech stack

- **Next.js 16 (App Router) and TypeScript:** pages and API route handlers live in one project and deploy together to Vercel, with type checking across the whole stack.
- **Supabase Postgres:** managed Postgres with a connection pooler that suits serverless functions.
- **Prisma 6:** type-safe queries, versioned migrations and interactive transactions for the status and admin changes. It is pinned to v6 because the schema uses `url` and `directUrl` in the `datasource` block, which Prisma 7 no longer supports.
- **Supabase Storage:** a private bucket with signed upload and download URLs, so evidence never has a public URL and never passes through the serverless function body.
- **sharp:** decodes and re-encodes images, which removes all metadata.
- **Zod 4 and `@asteasolutions/zod-to-openapi`:** one set of schemas both validates requests and generates the OpenAPI document, so the docs can't drift from the code.
- **jose:** signs and verifies HS256 JWTs using Web Crypto only, so it works on both the Edge and Node runtimes.
- **bcryptjs:** password hashing (cost 12) with no native build step.
- **Upstash Redis and `@upstash/ratelimit`:** sliding-window rate limits over HTTP, which works from serverless functions without keeping a connection open.
- **swagger-ui-dist:** Swagger UI served from our own origin, so the docs page makes no third-party requests.
- **Vitest:** runs this project's TypeScript and ESM directly, and one config holds the unit, integration and end-to-end projects.
- **Playwright:** drives a real browser for `npm run screenshots`.
- **`next/font`:** downloads the fonts (Inter Tight and Barlow) at build time and serves them from our own origin.

## Architecture

### Folder structure

```
whistledrop/
├── app/
│   ├── page.tsx, report/, track/        Reporter pages: home, report form + case code screen, tracking
│   ├── privacy/, accessibility/         Static information pages
│   ├── mod/                             Moderator area: login, dashboard, reports, report detail, moderators
│   │   └── ModShell.tsx                 Client-side guard: redirects to login without a token (UX only)
│   ├── api/
│   │   ├── reports/route.ts             POST   submit a report (with attachments)
│   │   ├── reports/lookup/route.ts      POST   reporter lookup, case code in the body (preferred)
│   │   ├── reports/[caseCode]/route.ts  GET    the same lookup, kept for API compatibility
│   │   ├── reports/messages/route.ts    POST   reporter message in the conversation
│   │   ├── uploads/sign/route.ts        POST   signed upload URL + upload token
│   │   ├── mod/login/route.ts           POST   moderator login
│   │   ├── mod/reports/…                GET list, GET detail, PATCH status, POST messages, POST notes, GET attachment link
│   │   ├── admin/moderators/…           GET/POST list and create, PATCH role / active
│   │   ├── openapi/route.ts             GET    OpenAPI 3.1 document
│   │   └── cron/cleanup/route.ts        GET    daily cleanup (Vercel Cron, CRON_SECRET)
│   ├── api-docs/route.ts                Swagger UI page (plain HTML, no inline scripts)
│   └── layout.tsx                       Root layout: self-hosted fonts, per-request rendering, QuickExit
├── components/                          UI building blocks, page sections and generated SVG/CSS visuals
├── lib/
│   ├── auth.ts                          JWT sign/verify for moderator and upload tokens (jose only; Edge-compatible)
│   ├── guards.ts                        withModerator / withAdmin: verify the token AND re-read the account from the database (server-only, Node)
│   ├── transitions.shared.ts            The allowed status transitions, imported by both the API and the browser UI
│   ├── validation.ts                    Server-only Zod schemas; the single source for request validation and the OpenAPI spec
│   ├── validation.client.ts             Plain-Zod browser copy of the report form rules (a test keeps it in sync with the server)
│   ├── cases.ts                         The case workflow (create, status, messages, notes), shared by routes and the demo seed
│   ├── caseLookup.ts                    The public lookup response, shared by the GET and POST lookup routes
│   ├── demo.ts                          Demo accounts, sample cases, and the daily demo-account reset
│   ├── caseCode.ts                      CSPRNG case code generation
│   ├── rateLimit.ts                     Upstash sliding windows keyed by a daily-rotating IP HMAC
│   ├── uploads.ts                       Magic-byte checks, sharp re-encoding, all-or-nothing attachment storage
│   ├── storage.ts                       Server-only Supabase Storage client (service role key)
│   ├── csp.ts                           Content-Security-Policy builders
│   ├── env.ts                           Validation of every server environment variable
│   ├── openapi.ts, zodOpenApi.ts        OpenAPI registry and document
│   ├── apiResponse.ts                   JSON success/error helpers (always Cache-Control: no-store)
│   ├── reports.ts, db.ts, site.ts       Public and moderator case shapes (conversation merge), Prisma client, site constants
│   └── client/                          Browser-only: typed API client, session (sessionStorage), case code input
├── proxy.ts                             Next.js proxy (formerly middleware): per-request CSP nonce for pages
├── prisma/                              schema.prisma, migrations/, seed.ts (first admin), seed-demo.ts (demo accounts + cases)
├── scripts/                             setup-storage.ts, check-env.ts, deactivate-account.ts, copy-swagger-ui.mjs, screenshots.mjs
├── tests/                               Unit, integration/ and e2e/ suites plus helpers/
├── docs/                                Frontend API contract and screenshots
├── DUMMY_SIGN_INS.txt                   Public demo credentials and sample case codes for reviewers
├── compose.test.yml                     Disposable Postgres for the integration tests
└── vercel.json                          Daily cron schedule
```

A few files are worth explaining:

- **`lib/auth.ts` vs `lib/guards.ts`.** `auth.ts` only signs and verifies tokens. It uses `jose` and Web Crypto, so it runs on either runtime. `guards.ts` wraps route handlers: it verifies the token with `auth.ts`, then loads the moderator from the database with Prisma, which needs the Node runtime. Keeping them apart means token logic never pulls Prisma into an Edge bundle, and no route can accidentally trust a token without the database check.
- **`lib/transitions.shared.ts`.** The workflow rules as plain data with no runtime imports. The status route enforces them, and the report detail page uses them to show only the buttons that can succeed.
- **`lib/validation.ts` vs `lib/validation.client.ts`.** `validation.ts` imports `server-only` and extends Zod with OpenAPI metadata, so it must never reach the browser. Client code may only `import type` from it. The report form needs runtime validation in the browser, so `validation.client.ts` repeats those rules in plain Zod, and `tests/client-validation.test.ts` checks every value against the server schema.
- **`proxy.ts`.** Runs on every page request (not API routes, `/api-docs` or static assets). It generates a random nonce and sets the page's Content-Security-Policy. It does no authentication.

### Request flow

1. The browser requests a page. `proxy.ts` creates a nonce and sets the CSP header. The page renders on demand (the root layout awaits `connection()`), and Next.js adds the nonce to its own scripts.
2. Client components call the API through `lib/client/api.ts`. Every call uses `fetch` with `credentials: "omit"`, `cache: "no-store"` and `referrerPolicy: "no-referrer"`. Moderator calls add the bearer token, which is kept in `sessionStorage` only.
3. The route handler runs. Public routes first call `checkRateLimit`. Moderator and admin routes are wrapped in `withModerator` or `withAdmin`, which answer `401` or `403` before the handler runs.
4. The body or query is parsed with a strict Zod schema. Unknown fields are rejected.
5. The handler talks to Postgres through Prisma (transaction pooler) and, for evidence, to Supabase Storage with the service role key.
6. The response goes out through `apiSuccess` or `apiError`, always as JSON with `Cache-Control: no-store`. Unexpected errors become a generic `500` and the details are logged on the server only.

## Status workflow

```
                   moderator                    moderator
  ┌───────────┐  starts review  ┌──────────────┐  acted on it  ┌──────────┐  archive  ┌──────────┐
  │ SUBMITTED │ ──────────────► │ UNDER_REVIEW │ ────────────► │ RESOLVED │ ────────► │  CLOSED  │
  └───────────┘                 └──────────────┘               └──────────┘           │          │
    set on                             │                                              │ final,   │
    submission                         │   no action needed   ┌───────────┐  archive  │ read-    │
                                       └────────────────────► │ DISMISSED │ ────────► │ only     │
                                                              └───────────┘           └──────────┘
                                                                                      closedAt set,
                                                                                      evidence purged
```

Only these five transitions exist. Anything else returns `409 INVALID_TRANSITION`: skipping review, reopening a resolved or dismissed report, or "changing" a status to the one it already has.

**CLOSED is permanent and read-only.** Closing sets `closedAt` and clears `awaitingReply`. After that, every status change, message and internal note, from any role and from the reporter, returns `423 REPORT_CLOSED`. The report, its history and the full conversation stay readable through the reporter's case-code lookup.

Every status change appears in the reporter's conversation as a system event. A `PUBLIC` note is shown inside that event; an `INTERNAL` note is not (it appears under the moderators' internal notes).

**Evidence is purged when a case closes.** Before the report is marked closed, the route deletes every file of the report from storage: the files its `Attachment` rows point to, plus anything else under the report's `reports/<id>/` folder. The attachment rows are then deleted in the same transaction that sets the status. The files go first on purpose: if deletion fails, the request returns `500`, nothing in the database has changed, and the close can simply be retried. The opposite order could leave a closed report whose files still exist.

## The conversation model

Every case has two separate channels:

| Channel | Who writes | Who reads | Stored as |
| --- | --- | --- | --- |
| **Conversation** | The reporter (with the case code) and moderators | The reporter and moderators | `CaseMessage` rows, plus every `StatusUpdate` as a system event |
| **Internal notes** | Moderators | Moderators only | `InternalNote` rows, plus the notes of `INTERNAL` status updates |

**What the reporter sees.** The public lookup returns `conversation`, one chronological list that merges:

- messages: `{ type: "message", author: "REPORTER" | "REVIEW_TEAM", body, createdAt }`
- status changes: `{ type: "status", status, note?, createdAt }`, where `note` is present only for a `PUBLIC` note.

No ids, no moderator ids or emails, no visibility flags and no `INTERNAL` notes ever leave the server on this path. Every moderator is simply `REVIEW_TEAM`. The older `statusUpdates` field (PUBLIC updates only) is still returned for compatibility.

**What moderators see.** `GET /api/mod/reports/{id}` returns the same `conversation` (identical entries and notes) with the moderator behind each entry, for accountability, and `internalNotes` separately: internal notes and `INTERNAL` status updates, each with its author. On the report page these are two clearly labelled blocks. The reply composer ("Reply to reporter — visible to the reporter") has the lime button; the internal-note composer ("Internal note — never visible to the reporter") has an outlined button and a dashed frame, so the two can't be confused. `POST /api/mod/reports/{id}/notes` has no visibility option at all: anything meant for the reporter goes through the messages endpoint.

**Awaiting reply.** `Report.awaitingReply` is set when the reporter posts and cleared when a moderator replies or the case closes, in the same transaction as the message insert or status change. The dashboard counts it, and the reports list can filter by it and tags those rows REPLY.

**Closed cases.** A reporter or moderator message to a CLOSED case gets `423` with "This case is closed. The conversation is read-only." The whole thread stays readable, and `/track` replaces the reply box with that sentence. Posting and closing both lock the report row, so a message can't slip in after a close commits.

**Abuse limits.** Reporter messages are limited to 10 per hour per client and case code (the key is an HMAC of the IP and the code together, so neither reaches Redis in clear). Each message request also counts against the per-IP lookup budget, because a wrong code gets the lookup's 404 and the endpoint could otherwise be used to guess codes.

## How anonymity is maintained

### What is stored, and what is never stored

The database holds exactly these tables:

- **Report:** internal `id`, `caseCode`, `category`, `description`, `evidenceUrl`, `status`, `awaitingReply`, `createdAt`, `updatedAt`, `closedAt`.
- **CaseMessage:** `id`, `reportId`, `authorType` (`REPORTER` or `MODERATOR`), `moderatorId` (only on moderator messages; a CHECK constraint enforces it), `body`, `createdAt`. A reporter message is its text and a timestamp: no IP, no IP hash, no user agent, nothing else.
- **InternalNote:** `id`, `reportId`, `moderatorId`, `body`, `createdAt`. Staff only.
- **StatusUpdate:** `id`, `reportId`, `note`, `visibility`, `newStatus`, `moderatorId` (the moderator who acted, never the reporter), `createdAt`.
- **Attachment:** `id`, `reportId`, `storagePath`, `mimeType`, `sizeBytes`, `createdAt`.
- **ConsumedUploadToken:** `jti` (a random token id) and `consumedAt`.
- **Moderator:** `id`, `email`, `passwordHash`, `role`, `isActive`, `isDemo`, `createdAt`.

Storage holds sanitized evidence under `reports/<reportId>/` until the case closes, and staged uploads under `staging/` until they are attached or cleaned up.

WhistleDrop **never stores** a reporter's IP address, user agent, cookies, session id, device fingerprint, email or account, in Postgres, in storage metadata or in its own logs. The submission and message handlers build database rows only from validated body fields, and the strict schemas reject any extra field, so a client can't slip extra data in. The tests check that request headers and the sender's IP never reach the database, for reports and for messages. Messages are the reporter's own words, so `/track` reminds them not to include their name or anything that could identify them. Reporter pages set no cookies, and the API client sends none.

### The case-code model

A case code is `WD-` followed by two groups of four characters, for example `WD-7K2P-Q9XM`. Generated codes use `A–Z` and `2–9`: **never `0` or `1`** (they are easily misread as `O` and `I`, and leaving them out keeps generated codes apart from the demo codes below). The eight characters come from Node's CSPRNG (`crypto.randomBytes`). Bytes of 238 and above are rejected before taking the value modulo 34, so every character is equally likely. That gives 34⁸, about 1.8 × 10¹² possible codes (about 40.7 bits). The code is not derived from the report id, the time or the content, and a unique constraint in the database is the final guard against collisions.

Codes are normalised before lookup. In the browser, `lib/client/caseCode.ts` accepts any case, spaces, missing dashes and a missing `WD` prefix, and rebuilds the canonical form, so a mistyped code doesn't use up a lookup. The server trims and uppercases the code, then checks it against `^WD-[A-Z0-9]{4}-[A-Z0-9]{4}$`. The accepted format still allows `0` and `1`, so codes issued before the alphabet change keep working.

**Demo codes are intentionally guessable.** The sample cases created by `npm run seed:demo` use the fixed codes `WD-DEMO-0001` to `WD-DEMO-0005`, so the codes in `DUMMY_SIGN_INS.txt` work on every demo deployment. They pass the same normalisation and validation as any code (a unit test checks this), and they exist only for the demo. Because every one of them contains `0` or `1` and generated codes never do, a real report can never be issued a demo code, and the demo reset can never touch one.

The case code is a bearer secret: anyone who has it can read that report's public view. The UI keeps it in React state only. It is never put in the page URL, browser storage or the console, and the downloadable text file's name doesn't contain it.

**The code travels in request bodies.** The Track page uses `POST /api/reports/lookup { caseCode }` and `POST /api/reports/messages { caseCode, body }`, so the code never appears in a URL: not in the address bar or history, and not in the request paths the hosting provider (Vercel) logs. **`POST /api/reports/lookup` is the preferred lookup.** The original `GET /api/reports/{caseCode}` still works, with an identical response, for API compatibility, but it puts the code in the path, where hosting request logs can record it.

### The daily-rotating IP hash

Rate limiting needs some notion of "the same client" without storing who that client is. The rate-limit key is `HMAC-SHA256(ip)`, keyed with `IP_HASH_SECRET` plus the current UTC date. The same address produces an unrelated key each day, so yesterday's keys can't be linked to today's. The hash exists **only as a Redis rate-limit key**. It expires on its own (after about two windows, at most a couple of hours), is never written to Postgres and is never logged. Upstash's analytics option is turned off, because it would keep extra copies of those keys.

### EXIF stripping

Every image (JPEG, PNG, WebP) is decoded and re-encoded with sharp. It is auto-rotated first, so it keeps its orientation once the EXIF orientation tag is gone. sharp writes no metadata unless asked to, so EXIF (including GPS coordinates, device make and model, and capture time), XMP, IPTC and embedded comments are all dropped. The integration tests check this for all three formats. **PDFs are not sanitized** (see [Known limitations](#known-limitations)).

### PUBLIC vs INTERNAL notes, and the conversation

Every status update carries a visibility, `PUBLIC` by default, which applies to its note. The status change itself is always shown to the reporter as an event in the conversation; its note is included only when `PUBLIC`. The public lookup's database query never selects a moderator id or email, and `lib/reports.ts` builds the reporter's view from an explicit allowlist of fields, so ids, visibility and moderator details can't leak. Moderator replies are attributed only to `REVIEW_TEAM`. Internal notes (`POST /api/mod/reports/{id}/notes`) are a separate table that the public path never reads. Moderators see everything, with authors.

### The staff audit trail

Every status update, moderator message and internal note records the acting moderator (`moderatorId`). The foreign key uses `ON DELETE RESTRICT`, so a moderator with history can't be deleted, even outside the API. This makes moderators accountable for what they do with a report.

The trail cannot identify reporters, because there is nothing about the reporter to record. A report row has no link to any person, device or network. Moderators see the report's content, its case code and the history of staff actions, and nothing else.

### Row-level security lockdown

Supabase exposes the `public` schema through its Data API (PostgREST) to anyone with the project's anon key. The migrations enable row-level security with **no policies** on every table (`Report`, `StatusUpdate`, `CaseMessage`, `InternalNote`, `Moderator`, `Attachment`, `ConsumedUploadToken`), so the Data API can neither read nor write anything. Prisma connects as the table owner, which bypasses RLS, so the app itself is unaffected.

### ConsumedUploadToken

To stop an upload token being used twice, its `jti` (a random UUID) is recorded when a report uses it. The table has only `jti` and `consumedAt`: no report id and nothing about the uploader. The daily cleanup deletes rows older than the 30-minute token lifetime, because an expired token is rejected before the table is ever checked.

### Headers

- **Nonce-based CSP on pages.** `proxy.ts` gives every page request a fresh nonce: `script-src 'self' 'nonce-…' 'strict-dynamic'`, plus `'unsafe-eval'` in development only. Next.js adds the nonce to its own scripts, and anything else, such as an injected `<script>`, is blocked. Fonts and images are same-origin, `connect-src` allows only our origin and the Supabase project (for direct uploads), framing and plugins are blocked, and `<base>` and form targets are limited to our own origin. API routes get a fixed same-origin policy, and `/api-docs` gets that policy plus what Swagger UI needs.
- **The `style-src` tradeoff.** Page styles allow `'unsafe-inline'`. React renders `style` attributes (the UI uses them for transforms and progress bars), and nonces can't cover style attributes. Inline styles can't run code, so scripts stay strict.
- **`Referrer-Policy: no-referrer`** on every response (and in the page metadata), so leaving WhistleDrop never tells the next site where the visitor came from.
- **`Cache-Control: no-store`** on every API response, so reports aren't kept in browser or proxy caches.
- Also `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and no `X-Powered-By` header.

### No third parties

- **No analytics** of any kind: no Vercel Analytics, no Speed Insights, no tag managers, no third-party scripts.
- **Self-hosted fonts.** `next/font` downloads the fonts at build time and serves them from `/_next/static`, so browsers never contact Google Fonts. The CSP's `font-src 'self'` would block them anyway.
- **Swagger UI is self-hosted with its validator disabled.** Its assets are copied from `swagger-ui-dist` into `public/api-docs/vendor/` on install. Its default validator badge, which sends the spec URL to `validator.swagger.io`, is turned off (`validatorUrl: null`). The authorization token is kept in memory only.
- **Scarf telemetry is blocked.** `swagger-ui-dist` depends on `@scarf/scarf`, whose install script reports downloads to Scarf. The `allowScripts` allowlist in `package.json` doesn't include it, so the script never runs.

### Outbound links and the quick exit

Every external link, including reporter-supplied evidence URLs and the GitHub link in the footer, opens a **"You're leaving WhistleDrop"** dialog first. It shows the full destination and notes that the other site can see the visitor's IP address. Continuing opens the link in a new tab with `rel="noopener noreferrer"`. Only `http` and `https` URLs can be opened, and evidence URLs are never fetched, previewed or unfurled.

Every reporter page has a **Leave site** button. It calls `location.replace()` to go to Google, which replaces WhistleDrop in the tab's history, so pressing Back doesn't return to it. The button is hidden in the moderator area.

## Security decisions

- **Timing-safe login.** When the email is unknown, the password is still checked against a fixed dummy bcrypt hash, so response time doesn't reveal which emails belong to moderators. Unknown email, wrong password and deactivated account all get the same `401 INVALID_CREDENTIALS` with the same message. The cron secret is compared with `crypto.timingSafeEqual` over SHA-256 digests.
- **Identical generic 404s.** An unknown case code and a malformed one get exactly the same `404 NOT_FOUND` "Report not found", from both lookup routes and from the reporter message endpoint, so a guesser can't tell "wrong format" from "doesn't exist". The lookup's rate limit is counted before any validation, so malformed guesses use up the budget too. Moderator routes do the same for malformed and unknown ids.
- **Concurrency-safe status updates.** The status route validates the transition, then in one transaction updates the report only `WHERE id = … AND status = <the status it validated>`, inserts the status update and (when closing) deletes the attachment rows. If two moderators act at once, exactly one wins. The other gets `409 CONFLICT`, or `423` if the winner closed the report.
- **Roles checked against the database on every request.** The JWT carries the role only for the UI. `withModerator` re-reads the account on every request, so deactivation and demotion take effect on the very next request, not when the 12-hour token expires.
- **Admins can't lock themselves out.** An admin can't demote or deactivate their own account (`403 CANNOT_MODIFY_SELF`).
- **Demo accounts are locked down.** Their credentials are public, so the server refuses any role or active-status change to a demo account (`403 DEMO_ACCOUNT_PROTECTED`), refuses any role or active-status change *by* a demo account to another account, and lets demo accounts create only `MODERATOR` accounts (`403 DEMO_ACCOUNT_RESTRICTED`). The daily cron restores them. See [Demo accounts](#demo-accounts).
- **The last admin can't be removed.** Role and active changes lock every active admin row (`SELECT … FOR UPDATE`) inside a transaction. Even two admins demoting each other at the same moment can't leave zero (`409 LAST_ADMIN`), and the caller's own admin status is re-checked after the lock.
- **Moderators with history can only be deactivated.** There is no delete endpoint, and the `ON DELETE RESTRICT` foreign key stops the database deleting a moderator who has written status updates. Deactivating (`isActive: false`) blocks the account immediately and keeps the audit trail intact.
- **Rate limits.** Sliding windows per client, using the hashed-IP key described above:

  | Endpoint | Limit |
  | --- | --- |
  | `POST /api/reports/lookup` and `GET /api/reports/:caseCode` (one shared budget) | 30 per 15 minutes |
  | `POST /api/reports/messages` | 10 per hour per client **and case code**, and each request also counts against the lookup budget |
  | `POST /api/reports` | 10 per hour |
  | `POST /api/uploads/sign` | 30 per hour |
  | `POST /api/mod/login` | 10 per 15 minutes |

  A limited request gets `429 RATE_LIMITED` with a `Retry-After` header.
- **503 when the rate limiter is unavailable in production.** If a production server has no Upstash credentials, rate-limited routes answer `503 RATE_LIMITER_UNAVAILABLE` rather than running unprotected. Other Redis errors fail closed with `500`. A Redis call that takes longer than 3 seconds is allowed through, so a slow Redis never stops people from reporting. Tests use an in-memory limiter, and local development falls back to it with a warning when Upstash isn't configured.
- **The Edge/Node split between auth and guards.** Token handling (`lib/auth.ts`) is pure `jose` and Web Crypto and could run on the Edge. The database check (`lib/guards.ts`) imports `server-only` and Prisma and runs in Node route handlers. Authorization happens in the route handlers, not in `proxy.ts`. The moderator pages' client-side guard only decides what to show.
- **Separate token audiences.** Moderator tokens and upload tokens are both signed with `JWT_SECRET` but carry different audiences, so neither can be used as the other.
- **Secrets stay on the server.** `lib/storage.ts` (the only user of the service role key), `lib/guards.ts` and `lib/validation.ts` import `server-only`, so importing them from client code fails the build. `lib/env.ts` checks every server variable where it is used and requires secrets to be at least 32 characters.
- **Strict bodies and quiet errors.** Every request schema is `.strict()`. `500` responses always carry the generic message "Something went wrong". Reporter routes log only the error type, never the message, because database errors can echo submitted content.

## Evidence upload flow

Vercel serverless functions reject request bodies larger than about 4.5 MB, and evidence can be up to 10 MB. So files never go through the API. The browser uploads each file straight to Supabase Storage with a short-lived signed URL, and the API only handles small JSON requests.

```
Browser                            WhistleDrop API                           Supabase Storage (private)
  │ 1. sign: POST /api/uploads/sign   │                                             │
  │    { mimeType, sizeBytes } ──────►│ checks type and size, creates a signed      │
  │                                   │ upload URL for staging/<uuid>.<ext> ───────►│
  │ ◄──── { uploadUrl, uploadToken }  │ uploadToken = JWT(path, type, size), 30 min │
  │                                   │                                             │
  │ 2. direct upload: PUT file ────────────────────────────────────────────────────►│ staging/<uuid>.<ext>
  │                                   │                                             │
  │ 3. POST /api/reports              │                                             │
  │    { …, attachments: [tokens] } ─►│ verify each token; reject reused ones       │
  │                                   │ download from staging ◄─────────────────────│
  │                                   │ real size must equal the declared size      │
  │                                   │ 4. magic-byte check against declared type   │
  │                                   │ 5. images: auto-rotate + re-encode (sharp)  │
  │                                   │    PDFs: validated only                     │
  │                                   │ store as reports/<reportId>/<id>.<ext> ────►│
  │                                   │ 6. attach: one transaction writes report,   │
  │                                   │    attachment rows and consumed tokens      │
  │ ◄─────────────── { caseCode }     │ delete the staging copies ─────────────────►│
```

**Allowed files:** `image/jpeg`, `image/png`, `image/webp` and `application/pdf`, from 1 byte to 10 MB (10,485,760 bytes) each, and at most **3 per report**. The declared size must match the uploaded file exactly. The magic bytes must match the declared type, whatever the file is called. Images over 50 megapixels are refused, which prevents decompression bombs. The bucket itself also enforces the 10 MB limit and the type allowlist (`npm run storage:setup` configures it).

**All or nothing.** If any attachment fails (bad token, wrong type, storage or database error), the files already stored for that submission are deleted, and no report, attachment or token record is kept. The staged uploads stay, so the reporter can fix the problem and resubmit with the same tokens while they're valid. Each token's `jti` is written to `ConsumedUploadToken` in the same transaction as the report. A reused token gets `409 UPLOAD_TOKEN_USED`, and if two submissions race with the same token, the primary key lets only one commit.

**Downloads.** Moderators get a signed download URL that expires after **60 seconds**, requested only when they click. The bucket has no public URLs.

**Daily cleanup cron.** `vercel.json` schedules `GET /api/cron/cleanup` at 03:00 UTC every day. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The job deletes staged uploads older than 1 hour (their tokens expired after 30 minutes, so they can never be attached) and `ConsumedUploadToken` rows older than 30 minutes. It returns the counts it deleted.

## API reference

All request and response bodies are JSON, and every API response has `Cache-Control: no-store`. Moderator and admin routes need `Authorization: Bearer <token>` from `POST /api/mod/login`. The generated reference with full schemas is at `/api-docs`, and the raw OpenAPI 3.1 document is at `/api/openapi`.

### Endpoints

| Method | Route | Auth | Request | Success response | Error codes |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/uploads/sign` | None (rate limited) | `{ mimeType, sizeBytes }` | `200 { uploadUrl, uploadToken, expiresIn: 1800 }` | 400, 429, 500, 503 |
| `POST` | `/api/reports` | None (rate limited) | `{ category, description, evidenceUrl?, attachments? }` | `201 { caseCode }` | 400 `BAD_REQUEST` `VALIDATION_ERROR` `INVALID_UPLOAD_TOKEN` `INVALID_UPLOAD`, 409 `UPLOAD_TOKEN_USED`, 429, 500, 503 |
| `POST` | `/api/reports/lookup` (preferred) | None (rate limited) | `{ caseCode }` (case-insensitive) | `200 { category, description, evidenceUrl, status, createdAt, statusUpdates: [{ note, newStatus, createdAt }], conversation: [...] }`; `statusUpdates` is PUBLIC only; see [The conversation model](#the-conversation-model) | 400, 404, 429, 500, 503 |
| `GET` | `/api/reports/:caseCode` | None (rate limited) | Case code in the path | Identical to `POST /api/reports/lookup`. Kept for compatibility; prefer POST, which keeps the code out of request logs | 404, 429, 500, 503 |
| `POST` | `/api/reports/messages` | None (rate limited) | `{ caseCode, body }` | `201 { conversation }` | 400, 404 (same as the lookup), 423 `REPORT_CLOSED`, 429, 500, 503 |
| `POST` | `/api/mod/login` | None (rate limited) | `{ email, password }` | `200 { token, tokenType: "Bearer", expiresIn: 43200 }` | 400, 401 `INVALID_CREDENTIALS`, 429, 500, 503 |
| `GET` | `/api/mod/reports` | Bearer (any role) | Query: `q`, `status`, `category`, `from`, `to`, `awaitingReply`, `sort`, `order`, `page`, `pageSize` | `200 { items: [{ id, caseCode, category, status, createdAt, updatedAt, closedAt, awaitingReply }], page, pageSize, total, totalPages }` | 400, 401, 500 |
| `GET` | `/api/mod/reports/:id` | Bearer (any role) | Report id in the path | `200` full report: all fields including `awaitingReply`, every status update with `visibility` and `moderator { id, email }`, `attachments [{ id, mimeType, sizeBytes, createdAt }]`, `conversation` (with moderator emails) and `internalNotes` | 401, 404, 500 |
| `PATCH` | `/api/mod/reports/:id/status` | Bearer (any role) | `{ newStatus, note?, visibility? }` | `200` full report | 400, 401, 404, 409 `INVALID_TRANSITION` `CONFLICT`, 423 `REPORT_CLOSED`, 500 |
| `POST` | `/api/mod/reports/:id/messages` | Bearer (any role) | `{ body }` | `201` full report (clears `awaitingReply`) | 400, 401, 404, 423 `REPORT_CLOSED`, 500 |
| `POST` | `/api/mod/reports/:id/notes` | Bearer (any role) | `{ body }` (always INTERNAL; no visibility option) | `201` full report | 400, 401, 404, 423 `REPORT_CLOSED`, 500 |
| `GET` | `/api/mod/reports/:id/attachments/:attachmentId` | Bearer (any role) | Ids in the path | `200 { url, expiresIn: 60, mimeType, sizeBytes }` | 401, 404, 500 |
| `GET` | `/api/admin/moderators` | Bearer (ADMIN) | None | `200 { items: [{ id, email, role, isActive, isDemo, createdAt }] }` | 401, 403 `FORBIDDEN`, 500 |
| `POST` | `/api/admin/moderators` | Bearer (ADMIN) | `{ email, password, role? }` | `201 { id, email, role, isActive, isDemo, createdAt }` | 400, 401, 403 `FORBIDDEN` `DEMO_ACCOUNT_RESTRICTED`, 409 `EMAIL_TAKEN`, 500 |
| `PATCH` | `/api/admin/moderators/:id` | Bearer (ADMIN) | `{ role?, isActive? }` (at least one) | `200 { id, email, role, isActive, isDemo, createdAt }` | 400, 401, 403 `FORBIDDEN` `CANNOT_MODIFY_SELF` `DEMO_ACCOUNT_PROTECTED` `DEMO_ACCOUNT_RESTRICTED`, 404, 409 `LAST_ADMIN`, 500 |
| `GET` | `/api/openapi` | None | None | `200` OpenAPI 3.1 document | None |
| `GET` | `/api-docs` | None | None | Swagger UI (HTML) | None |
| `GET` | `/api/cron/cleanup` | Bearer `CRON_SECRET` | None | `200 { deletedStagingObjects, deletedConsumedUploadTokens, demoAccountsReset, demoReportsDeleted, demoSamplesReset }` (the last two are 0 unless `DEMO_MODE=true`) | 401, 500 |

### Field rules

| Field | Rule |
| --- | --- |
| `category` | `SECURITY`, `HARASSMENT`, `CORRUPTION`, `TECHNICAL` or `OTHER` |
| `description` | 20 to 5,000 characters after trimming |
| `evidenceUrl` | Optional `http`/`https` URL, at most 2,048 characters |
| `attachments` | Optional array of up to 3 distinct upload tokens |
| `mimeType` | `image/jpeg`, `image/png`, `image/webp` or `application/pdf` |
| `sizeBytes` | Integer from 1 to 10,485,760; must equal the uploaded file's real size |
| `newStatus` | Must be an allowed transition from the current status |
| `note` | Optional, at most 2,000 characters after trimming |
| `visibility` | `PUBLIC` (default) or `INTERNAL`; applies to the note. The status change is always shown to the reporter; only a `PUBLIC` note is shown with it |
| `body` (messages, notes) | 1 to 2,000 characters after trimming; line breaks are kept |
| `caseCode` (body) | A string of at most 64 characters; anything that isn't a valid code gets the same `404` as an unknown one |
| `email` | Trimmed and lowercased; unique across moderators |
| `password` (new moderator) | At least 12 characters and at most 72 bytes (bcrypt's limit) |
| `role` | `ADMIN` or `MODERATOR` (default `MODERATOR`) |
| `q` | 1 to 200 characters; case-insensitive substring match on description and case code (`%` and `_` match literally) |
| `status`, `category` (query) | Comma-separated lists, e.g. `RESOLVED,DISMISSED` |
| `from`, `to` | Inclusive `createdAt` range: `YYYY-MM-DD` (whole UTC day) or an ISO datetime with offset |
| `sort`, `order` | `createdAt` (default), `updatedAt` or `status` (workflow order); `asc` or `desc` (default) |
| `page`, `pageSize` | Page from 1 (default 1); page size 1 to 100 (default 20) |
| `awaitingReply` (query) | `true` (only cases whose latest message is the reporter's) or `false` |

Every body and query schema is strict: unknown fields are rejected with `400`.

### Error response shape

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "description: Too small: expected string to have >=20 characters" } }
```

### Status codes

| HTTP | Codes | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `VALIDATION_ERROR`, `INVALID_UPLOAD_TOKEN`, `INVALID_UPLOAD` | The body isn't valid JSON, a field or query parameter fails validation (the message names the first bad field), an upload token is malformed, tampered with or expired, or an uploaded file is missing, the wrong size, over 10 MB, not the declared type, or can't be decoded. |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | The token is missing, invalid or expired, or the account has been deactivated; or login failed (the same answer for every reason). |
| 403 | `FORBIDDEN`, `CANNOT_MODIFY_SELF`, `DEMO_ACCOUNT_PROTECTED`, `DEMO_ACCOUNT_RESTRICTED` | Signed in, but the route needs the ADMIN role; an admin tried to demote or deactivate their own account; someone tried to change a demo account's role or status; or a demo account tried to change another account's role or status, or to create an ADMIN. |
| 404 | `NOT_FOUND` | Unknown case code, report, attachment or moderator. Malformed ids and codes get the identical response. Evidence of a closed report also returns 404, because its attachment rows are deleted. |
| 409 | `INVALID_TRANSITION`, `CONFLICT`, `UPLOAD_TOKEN_USED`, `EMAIL_TAKEN`, `LAST_ADMIN` | The status change isn't allowed from the current status; another moderator changed the status first; an upload token was already used; the email is taken; or the change would leave no active admin. |
| 410 | Not used | The API never returns 410. Purged evidence answers 404 instead (the report detail page treats either as "purged"). |
| 423 | `REPORT_CLOSED` | The report is CLOSED and permanently read-only. Messages to a closed case get the message "This case is closed. The conversation is read-only." |
| 429 | `RATE_LIMITED` | Too many requests from this client. `Retry-After` gives the wait in seconds. |
| 500 | `INTERNAL_ERROR` | Unexpected failure. Always the generic message "Something went wrong"; details are logged on the server only. |
| 503 | `RATE_LIMITER_UNAVAILABLE` | A rate-limited route was called on a production server with no Upstash credentials configured. |

## Example requests: a full case lifecycle

These were run against a local server. Responses are real, shortened with `…` where noted. `$BASE` is `http://localhost:3000` locally or `<LIVE_URL>` in production.

**1. Submit a report.**

```bash
curl -s -X POST "$BASE/api/reports" -H 'content-type: application/json' \
  -d '{"category":"CORRUPTION","description":"The lab equipment budget was billed twice for the same order in March.","evidenceUrl":"https://example.org/invoice-scan"}'
```

```json
{ "caseCode": "WD-WR0A-5I3J" }
```

**2. Track it as the reporter.** The code goes in the body, not the URL:

```bash
curl -s -X POST "$BASE/api/reports/lookup" -H 'content-type: application/json' -d '{"caseCode":"WD-WR0A-5I3J"}'
```

```json
{
  "category": "CORRUPTION",
  "description": "The lab equipment budget was billed twice for the same order in March.",
  "evidenceUrl": "https://example.org/invoice-scan",
  "status": "SUBMITTED",
  "createdAt": "2026-09-24T07:32:58.555Z",
  "statusUpdates": [],
  "conversation": []
}
```

**3. Sign in as a moderator.**

```bash
TOKEN=$(curl -s -X POST "$BASE/api/mod/login" -H 'content-type: application/json' \
  -d '{"email":"admin@example.org","password":"<password>"}' | jq -r .token)
```

```json
{ "token": "eyJhbGciOiJIUzI1NiJ9…", "tokenType": "Bearer", "expiresIn": 43200 }
```

Find the report's internal id (search accepts the case code):

```bash
curl -s "$BASE/api/mod/reports?q=WD-WR0A-5I3J" -H "authorization: Bearer $TOKEN"
```

```json
{
  "items": [{ "id": "c1p6brt03xj8120atqpz7saf6", "caseCode": "WD-WR0A-5I3J", "category": "CORRUPTION", "status": "SUBMITTED", "createdAt": "2026-09-24T07:32:58.555Z", "updatedAt": "2026-09-24T07:32:58.555Z", "closedAt": null, "awaitingReply": false }],
  "page": 1, "pageSize": 20, "total": 1, "totalPages": 1
}
```

**4. Start the review with a public note.**

```bash
curl -s -X PATCH "$BASE/api/mod/reports/c1p6brt03xj8120atqpz7saf6/status" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"newStatus":"UNDER_REVIEW","note":"Thank you. We are looking into this."}'
```

```json
{
  "id": "c1p6brt03xj8120atqpz7saf6",
  "status": "UNDER_REVIEW",
  "awaitingReply": false,
  "statusUpdates": [
    {
      "id": "cmuf7sx0b0001x2f48xpdsm3j",
      "note": "Thank you. We are looking into this.",
      "visibility": "PUBLIC",
      "newStatus": "UNDER_REVIEW",
      "createdAt": "2026-09-24T07:32:59.292Z",
      "moderatorId": "cmuf7sw8c0000x2g338enqg23",
      "moderator": { "id": "cmuf7sw8c0000x2g338enqg23", "email": "admin@example.org" }
    }
  ],
  "conversation": [
    { "type": "status", "id": "cmuf7sx0b0001x2f48xpdsm3j", "status": "UNDER_REVIEW", "note": "Thank you. We are looking into this.", "visibility": "PUBLIC", "createdAt": "2026-09-24T07:32:59.292Z", "moderator": { "id": "cmuf7sw8c0000x2g338enqg23", "email": "admin@example.org" } }
  ],
  "internalNotes": [],
  "attachments": [],
  "…": "caseCode, category, description, evidenceUrl, createdAt, updatedAt, closedAt omitted"
}
```

**5. Ask the reporter a question.**

```bash
curl -s -X POST "$BASE/api/mod/reports/c1p6brt03xj8120atqpz7saf6/messages" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"body":"Do you know roughly when the second invoice was paid? Please do not include names."}'
```

`201` with the full report; the new conversation entry is `{ "type": "message", "author": "REVIEW_TEAM", "body": "Do you know…", "moderator": { "id": "cmuf7sw8c0000x2g338enqg23", "email": "admin@example.org" }, … }`.

**6. The reporter answers.** Only the case code and the text are sent, and the reply shows the moderator only as `REVIEW_TEAM`:

```bash
curl -s -X POST "$BASE/api/reports/messages" -H 'content-type: application/json' \
  -d '{"caseCode":"WD-WR0A-5I3J","body":"Early April, a few weeks after the first one."}'
```

```json
{
  "conversation": [
    { "type": "status", "status": "UNDER_REVIEW", "note": "Thank you. We are looking into this.", "createdAt": "2026-09-24T07:32:59.292Z" },
    { "type": "message", "author": "REVIEW_TEAM", "body": "Do you know roughly when the second invoice was paid? Please do not include names.", "createdAt": "2026-09-24T07:32:59.700Z" },
    { "type": "message", "author": "REPORTER", "body": "Early April, a few weeks after the first one.", "createdAt": "2026-09-24T07:32:59.822Z" }
  ]
}
```

The case now has `awaitingReply: true`, so it appears in `GET /api/mod/reports?awaitingReply=true`.

**7. Add an internal note.** Internal notes have their own endpoint, with no visibility option:

```bash
curl -s -X POST "$BASE/api/mod/reports/c1p6brt03xj8120atqpz7saf6/notes" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"body":"Forwarded to finance."}'
```

```json
{
  "internalNotes": [
    { "type": "note", "id": "cmuf7sxrc0007x2f4k5v6xwpq", "note": "Forwarded to finance.", "createdAt": "2026-09-24T07:33:00.265Z", "moderator": { "id": "cmuf7sw8c0000x2g338enqg23", "email": "admin@example.org" } }
  ],
  "…": "the rest of the report"
}
```

Sending `"visibility": "PUBLIC"` to this endpoint is rejected: `{ "error": { "code": "VALIDATION_ERROR", "message": "Unrecognized key: \"visibility\"" } }`.

**8. Resolve, with an INTERNAL note.** The reporter sees the status change, but not the note:

```bash
curl -s -X PATCH "$BASE/api/mod/reports/c1p6brt03xj8120atqpz7saf6/status" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"newStatus":"RESOLVED","note":"Finance confirmed the duplicate payment and recovered it.","visibility":"INTERNAL"}'
```

The moderators' `internalNotes` gain `{ "type": "status", "status": "RESOLVED", "note": "Finance confirmed the duplicate payment and recovered it.", … }`. The reporter's view at this point:

```json
{
  "status": "RESOLVED",
  "statusUpdates": [
    { "note": "Thank you. We are looking into this.", "newStatus": "UNDER_REVIEW", "createdAt": "2026-09-24T07:32:59.292Z" }
  ],
  "conversation": [
    { "type": "status", "status": "UNDER_REVIEW", "note": "Thank you. We are looking into this.", "createdAt": "2026-09-24T07:32:59.292Z" },
    { "type": "message", "author": "REVIEW_TEAM", "body": "Do you know roughly when the second invoice was paid? Please do not include names.", "createdAt": "2026-09-24T07:32:59.700Z" },
    { "type": "message", "author": "REPORTER", "body": "Early April, a few weeks after the first one.", "createdAt": "2026-09-24T07:32:59.822Z" },
    { "type": "status", "status": "RESOLVED", "createdAt": "2026-09-24T07:33:00.292Z" }
  ],
  "…": "category, description, evidenceUrl, createdAt omitted"
}
```

**9. Close the case.**

```bash
curl -s -X PATCH "$BASE/api/mod/reports/c1p6brt03xj8120atqpz7saf6/status" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"newStatus":"CLOSED","note":"This case is resolved and now closed. Thank you for reporting."}'
```

```json
{
  "status": "CLOSED",
  "closedAt": "2026-09-24T07:33:00.365Z",
  "awaitingReply": false,
  "attachments": [],
  "…": "…"
}
```

Any further status change is refused with `{ "error": { "code": "REPORT_CLOSED", "message": "This report is closed and can no longer be changed" } }`, and a message from either side with:

```json
{ "error": { "code": "REPORT_CLOSED", "message": "This case is closed. The conversation is read-only." } }
```

The reporter can still read everything:

```json
{
  "status": "CLOSED",
  "conversation": [
    { "type": "status", "status": "UNDER_REVIEW", "note": "Thank you. We are looking into this.", "createdAt": "2026-09-24T07:32:59.292Z" },
    { "type": "message", "author": "REVIEW_TEAM", "body": "Do you know roughly when the second invoice was paid? Please do not include names.", "createdAt": "2026-09-24T07:32:59.700Z" },
    { "type": "message", "author": "REPORTER", "body": "Early April, a few weeks after the first one.", "createdAt": "2026-09-24T07:32:59.822Z" },
    { "type": "status", "status": "RESOLVED", "createdAt": "2026-09-24T07:33:00.292Z" },
    { "type": "status", "status": "CLOSED", "note": "This case is resolved and now closed. Thank you for reporting.", "createdAt": "2026-09-24T07:33:00.367Z" }
  ],
  "…": "category, description, evidenceUrl, createdAt, statusUpdates omitted"
}
```

## Local setup

### Prerequisites

- Node.js 20.9 or newer, and npm
- A Supabase project (Postgres and Storage)
- An Upstash Redis database (optional locally, required in production)
- Docker, only for the integration tests

### 1. Install

```bash
cd whistledrop
npm install
```

`postinstall` runs `prisma generate` and copies Swagger UI's assets into `public/api-docs/vendor/`.

### 2. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). This deployment uses the `ap-southeast-2` (Sydney) region.
2. Open **Connect** in the project dashboard and copy two connection strings: the **transaction pooler** (port 6543) for `DATABASE_URL`, with `?pgbouncer=true` appended, and the **session pooler** (port 5432) for `DIRECT_URL`.
3. Open **Project Settings → API** and copy the project URL (`SUPABASE_URL`) and the `service_role` secret key (`SUPABASE_SERVICE_ROLE_KEY`).
4. The private `evidence` bucket is created by a script in step 5, so there's nothing to create by hand.

### 3. Create the Upstash database

Create a Redis database at [upstash.com](https://upstash.com), ideally in the same region as Supabase, and copy its REST URL and token. Locally you can skip this: `npm run dev` then uses an in-memory limiter and logs a warning.

### 4. Configure `.env.local`

```bash
cp .env.example .env.local
```

| Variable | Explanation |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL (port 6543, `?pgbouncer=true`). Used by the app at runtime. |
| `DIRECT_URL` | Supabase session pooler (port 5432) or direct URL. Used by Prisma Migrate, which can't run through the transaction pooler. |
| `JWT_SECRET` | Signs moderator and upload tokens. At least 32 characters (`openssl rand -base64 48`). Changing it signs every moderator out and voids pending uploads. |
| `IP_HASH_SECRET` | Keys the daily-rotating HMAC used for rate-limit keys. At least 32 characters. |
| `SUPABASE_URL` | Supabase project URL. Also added to the CSP's `connect-src` so browsers can upload to Storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for Storage. Server-only: never give it a `NEXT_PUBLIC_` prefix. |
| `CRON_SECRET` | Bearer secret for `/api/cron/cleanup`. At least 32 characters. |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL (`KV_REST_API_URL` from the Vercel integration also works). |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token (`KV_REST_API_TOKEN` also works). |
| `SEED_MODERATOR_EMAIL` | Email of your own first ADMIN account, created by `npm run db:seed`. Keep it out of the repository. |
| `SEED_MODERATOR_PASSWORD` | Password for that account. Never reuse it anywhere else, and never use a demo password. |
| `DEMO_MODE` | Optional, `true` or `false` (default `false`; anything else is an error). `true` marks a **public demo instance**: see [Demo mode](#demo-mode). Never set it where real reports live: the daily cron then deletes reports. |
| `TEST_DATABASE_URL` | Optional. Overrides the integration tests' local Docker database. |

The `db:*`, `storage:setup` and `env:check` scripts load `.env.local` explicitly with `dotenv-cli`. Run `npm run env:check` to validate every server variable at once.

### 5. Migrate, create the bucket, seed

```bash
npm run db:deploy       # apply prisma/migrations (prisma migrate deploy)
npm run storage:setup   # create or update the private "evidence" bucket (10 MB limit, allowed types only)
npm run db:seed         # create or restore the ADMIN from SEED_MODERATOR_* (safe to re-run)
npm run seed:demo       # optional, demo instances only: public demo accounts and sample cases (needs DEMO_MODE=true, or -- --force)
```

To change the schema, edit `prisma/schema.prisma` and create a new migration with `npm run db:migrate -- --name <change>`.

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000, and the API docs at http://localhost:3000/api-docs. Sign in at `/mod/login` with the seeded account.

## Testing

### The test database

The integration tests run against a disposable Postgres defined in **`compose.test.yml`** (`postgres:17-alpine` on `127.0.0.1:54329`, data kept in tmpfs), never against Supabase. `vitest.config.mts` points both `DATABASE_URL` and `DIRECT_URL` at `TEST_DATABASE_URL`, which defaults to `postgresql://postgres:postgres@127.0.0.1:54329/whistledrop_test`. `tests/integration/globalSetup.ts` refuses to run unless that URL points at a local host and a database whose name ends in `_test`. It then applies the migrations, and each test truncates the tables first. The tests set their own `JWT_SECRET`, `IP_HASH_SECRET` and `CRON_SECRET`, so no `.env.local` is needed.

### Running the tests

```bash
npm test                  # unit tests: no database or network needed
npm run test:db:up        # start the test Postgres (docker compose -f compose.test.yml up)
npm run test:integration  # integration tests against it
npm run test:e2e          # next build, then tests against next start
npm run test:all          # all three (needs the test database running)
npm run test:db:down      # stop and discard the test database
```

### What they cover

- **Unit tests** (`tests/*.test.ts`, with Prisma, Storage and Upstash replaced by fakes): report submission and lookup, including that request headers never reach the database; moderator login and the auth guard on every moderator route; the transition rules and the status route; rate limiting and IP hashing; environment validation; and that the client-side validation matches the server schemas.
- **Integration tests** (`tests/integration/`, with real Prisma, migrations, transactions and row locks; Storage replaced by an in-memory fake; image sanitizing uses the real sharp): submission and lookup (GET and POST), the conversation (reporter and moderator messages, no moderator identity or INTERNAL notes in the public view, `awaitingReply` toggling and filtering, 423 after close for both sides, a message racing a close, the reporter message rate limit, identical 404s), internal notes, the demo-account protections, the demo seed's idempotency, and the cron's demo-account reset, as well as login, status transitions, closing and read-only enforcement, evidence purge on close, PUBLIC vs INTERNAL notes and the audit trail, search, filters, sorting and pagination, role enforcement and admin self-protection including the last-admin rule, uploads (type, size and magic-byte checks, EXIF removal for JPEG, PNG and WebP, token reuse and rollback), attachment downloads, and the cleanup cron.
- **End-to-end tests** (`tests/e2e/`, against `next start`, run twice from one build: `DEMO_MODE=false` and `DEMO_MODE=true`): the page CSP nonce matches every script Next.js renders, and API routes and `/api-docs` keep their fixed policies; the demo banner appears on Home, Report and Track (in warm paper and dark ink) only in demo mode; and in demo mode the report form won't submit until the acknowledgement is ticked. The browser tests need Chromium: `npx playwright install chromium` once.

### Screenshots

```bash
npx playwright install chromium   # once
npm run screenshots
```

This builds the app, starts it on port 3123, creates data **through the real API only** (it submits reports and signs in with the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` or `SEED_MODERATOR_*` account from `.env.local`), and saves desktop and mobile screenshots to `docs/screenshots/`. `npm run screenshots -- --only=dashboard,reports` retakes selected pages. The case code screen is a real submission, so it counts toward the 10-per-hour report limit.

## Deployment (Vercel)

1. **Import the repository** into Vercel and set **Root Directory** to `whistledrop`.
2. **Build.** No custom commands are needed. `npm install` runs `postinstall`, which runs `prisma generate` and copies the Swagger UI assets. Then `next build` runs.
3. **Database.** Migrations and the seed are **not** run on Vercel. Run them from your local machine against the production database before deploying code that needs them:
   ```bash
   npm run db:deploy
   npm run storage:setup   # once per Supabase project
   npm run db:seed
   npm run seed:demo       # demo instances only (DEMO_MODE=true): public demo accounts and sample cases
   ```
4. **Environment variables.** Set `DATABASE_URL`, `JWT_SECRET`, `IP_HASH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `CRON_SECRET` for the **Production** environment only, with values different from local development. `DIRECT_URL` and the `SEED_*` variables aren't needed on Vercel, because migrations and seeding run locally. `SUPABASE_URL` is read at build time (the API CSP) and at runtime (the page CSP). Run `npm run env:check` against the production values before the first deploy.
5. **Function region.** Set the function region to **`syd1`** (Sydney) in the project's settings, so functions sit next to Supabase in `ap-southeast-2`. Every query is a network round trip, and a status change makes several in one transaction.
6. **Cron.** `vercel.json` declares the daily cleanup (`0 3 * * *`, `GET /api/cron/cleanup`), which also resets the demo accounts and, with `DEMO_MODE=true`, purges visitor reports and resets the sample cases. Vercel registers it on deploy and sends `Authorization: Bearer $CRON_SECRET` automatically once `CRON_SECRET` is set.
7. **Analytics off.** Vercel Web Analytics and Speed Insights stay disabled for the project. Neither package is installed, and the CSP would block their scripts anyway.

## Demo accounts

So reviewers can try the moderator and admin features on the live site, `npm run seed:demo` (`prisma/seed-demo.ts`) creates three accounts whose credentials are **public by design** and listed in [`DUMMY_SIGN_INS.txt`](DUMMY_SIGN_INS.txt), which the sign-in page links to:

| Account | Role |
| --- | --- |
| `admin@whistledrop.demo` | ADMIN |
| `aria@whistledrop.demo` | MODERATOR |
| `kiran@whistledrop.demo` | MODERATOR |

Run it only on a [demo-mode](#demo-mode) instance: without `DEMO_MODE=true` it refuses unless given `-- --force`. It also creates five fictional sample cases with fixed, deliberately guessable codes, `WD-DEMO-0001` to `WD-DEMO-0005` (see [The case-code model](#the-case-code-model)), one per status, including an ongoing conversation (`0001`, awaiting reply) and a closed case whose conversation stays readable (`0003`). They are built through the same service functions the API uses (`lib/cases.ts`), not raw SQL. The script is idempotent: it restores the accounts' passwords, roles and active status, and leaves existing sample cases alone.

Because anyone can sign in as these accounts, the server protects them (`Moderator.isDemo`):

- A demo account's role and active status can't be changed through the API, by anyone (`403 DEMO_ACCOUNT_PROTECTED`).
- A demo account can't change any other account's role or active status (`403 DEMO_ACCOUNT_RESTRICTED`): not demote or deactivate a real account, and not promote or reactivate one either, since that would hand ADMIN, or a retired account, to whoever holds the public credentials.
- A demo admin can create only `MODERATOR` accounts, so it can't mint a non-demo ADMIN.
- The daily cron (`/api/cron/cleanup`) makes every demo account active again with its original role.

### Demo mode

Set `DEMO_MODE=true` on a deployment that exists only as a public demo. It is read at request time, and it is validated: only `true` or `false` are accepted (`npm run env:check` reports anything else, and the pages and cron refuse to guess). With it on:

1. **Banner.** Home, Report and Track show a slim notice pinned to the top, in warm paper and dark ink (never lime, so it can't look like an action): *"Public demo. Reports here are visible to anyone using the demo moderator accounts. Do not submit real information."* The page is pushed down by the banner's height, so nothing is hidden behind it.
2. **Acknowledgement.** The report form won't submit until the reporter ticks *"I understand this is a demo and I'm not submitting real information."* (a UI safeguard; nothing extra is sent to the API).
3. **Daily purge and reset.** `/api/cron/cleanup` also deletes every report that isn't a sample case and is older than 24 hours, with its messages, notes and evidence files (storage first, then the rows, so a storage failure deletes nothing and is retried the next day). It then rebuilds the five `WD-DEMO` sample cases in their seeded state, discarding whatever visitors added. The response reports `demoReportsDeleted` and `demoSamplesReset`.

With `DEMO_MODE` unset or `false`, none of this happens: no banner, no checkbox, no deletion, and `npm run seed:demo` refuses to run unless you pass `-- --force`, because the demo passwords are public.

### Retiring an account

To retire a real account (moderators with history can't be deleted), deactivate it: `npm run account:deactivate -- <email>` (`scripts/deactivate-account.ts`). It refuses demo accounts and the last active ADMIN.

## Design decisions and assumptions

- **CSP nonces rather than hashes or `'unsafe-inline'`.** Next.js injects inline bootstrap scripts that change per build and per page, and it supports reading a per-request nonce. The price is that every page renders on demand (a prerendered page would carry no nonce), which is acceptable for this app's traffic.
- **The chosen rate limits.** 30 lookups per 15 minutes is plenty for a reporter checking a case, but against about 1.8 × 10¹² codes it makes guessing hopeless. 10 submissions per hour allows genuine use while slowing spam. 30 upload signatures per hour covers three files per report with retries. 10 login attempts per 15 minutes slows password guessing without locking out a moderator who mistypes.
- **ConsumedUploadToken.** Upload tokens are stateless JWTs, so something has to remember which ones were used. A table holding only random ids, deleted once the tokens have expired, gives single use without linking anything to a report or a person.
- **The moderator deletion restriction.** Deleting a moderator would either erase their part in the audit trail or leave orphaned history, so accounts with history can only be deactivated. The database enforces this, not just the API.
- **OpenAPI generated from the existing Zod schemas.** The schemas that validate requests also produce the spec, so the docs describe exactly what the API accepts.
- **Type-only imports from `validation` in client code.** The server schemas carry OpenAPI metadata and server rules and import `server-only`. Client code takes only types from them, and the one runtime copy (`validation.client.ts`) is checked against the server by a test.
- **No fabricated testimonials.** The landing page makes promises about how the app works and shows no invented quotes, user counts or endorsements.
- **Assumptions.** Reporters may be on shared or monitored devices, so nothing is kept in the browser. Moderators are trusted staff, but they are audited and still can't see who reported. The app runs behind Vercel's proxy, which sets `X-Forwarded-For`.

## Known limitations

- **PDF metadata is not stripped.** PDFs are only checked for type and size. Author, producer, creation tool, timestamps, and any embedded or hidden content stay as uploaded. Reporters should remove PDF metadata themselves, for example by printing to a new PDF, before uploading.
- **A lost case code can't be recovered.** Nothing links a report to its reporter, so there's no reset or recovery.
- **The reporter's network provider can still see the site visit.** ISPs, workplace or campus networks and the hosting platform can see that a device connected to WhistleDrop. At-risk reporters should use Tor or a trusted VPN from a device and network that aren't monitored.
- **The legacy GET lookup puts case codes in request logs.** The Track page uses the POST routes, but `GET /api/reports/{caseCode}` still exists for compatibility, and anyone calling it puts the code in a logged path.
- **Messages are free text.** A reporter can still identify themselves in what they write; the UI warns them, but nothing can stop it. Messages can't be edited or deleted.
- **Demo accounts can read every report.** On a deployment with the demo accounts seeded, anyone can sign in as a moderator, so only fictional data should live there: run it with `DEMO_MODE=true`, which warns reporters and deletes their reports after a day. Demo accounts are limited only in account management, not in case access.
- **Content can identify its author.** A description, writing style or the evidence itself can give a reporter away, and `createdAt` is stored to the millisecond, so someone who could see both platform logs and the database could try to match them.
- **Rate-limit windows reset at 00:00 UTC**, because the IP hash's salt rotates daily. Everyone behind one shared IP (a campus network or a Tor exit) also shares one budget.
- **The rate limiter trusts `X-Forwarded-For`.** That's correct behind Vercel. Exposed directly, clients could forge the header.
- **Moderator tokens can't be revoked individually.** Deactivation blocks an account immediately, but there is no "sign out everywhere" for an active account short of rotating `JWT_SECRET`.
- **Abandoned uploads can linger for up to about 25 hours** before the daily cleanup deletes them.
- **Search is a plain substring scan** (`ILIKE '%…%'`), fine at this scale but in need of an index or full-text search for large datasets.
- **Pages can't be statically generated or cached at the edge**, because each needs a fresh nonce.
- **Prisma's `package.json#prisma.seed` setting is deprecated.** It works on the pinned Prisma 6.

## Future improvements

- Retire `GET /api/reports/{caseCode}` once no client uses it.
- Strip PDF metadata, or flatten PDFs to images.
- Scope demo accounts to the sample cases, so a demo deployment could also hold real reports.
- Add a description preview to the reports list.
- Revocable moderator sessions and optional two-factor authentication.
- Full-text or trigram search for larger datasets.

## Acknowledgements

Built for the **GDG on Campus SRM** recruitment 2026–27 (Technical Domain). The interface follows the **"Lime Ledger"** design language.

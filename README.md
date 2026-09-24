<div align="center">

# WhistleDrop

**Speak without being seen.**

An anonymous reporting service. Submit a report without an account, get a case code only you hold, and follow your case while moderators review it.

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Prisma 6](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Storage-3ecf8e?logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6e9f18?logo=vitest&logoColor=white)

[**Live app**](<LIVE_URL>) · [**API docs**](<LIVE_URL>/api-docs) · [**Full documentation**](whistledrop/README.md)

<img src="whistledrop/docs/screenshots/01-home-desktop.png" alt="WhistleDrop home page" width="820">

</div>

## What it is

WhistleDrop is my submission for the **GDG on Campus SRM** Technical Domain brief, *"WhistleDrop — Speak Without Being Seen"*.

- **Reporters** choose a category and describe the issue. They can add a link and up to three evidence files. In return they get a case code such as `WD-7K2P-Q9XM`, which they use to track the case. There's no account and no email, and nothing links the code back to them.
- **Moderators** sign in to a dashboard where they can search and filter reports and download evidence through links that expire after 60 seconds. They move each case through `SUBMITTED → UNDER_REVIEW → RESOLVED | DISMISSED → CLOSED` and can attach notes that are either shown to the reporter or kept internal. Closing a case makes it read-only permanently and deletes its evidence.

## Highlights

| | |
| --- | --- |
| 🕶️ **No identity stored** | No IPs, cookies, user agents or accounts for reporters. Rate limiting uses an HMAC of the IP that rotates daily and is stored only in Redis. |
| 🧼 **Metadata stripped** | Every image is re-encoded, which removes EXIF data such as GPS location and device model. Uploads are checked by their magic bytes, not the name the client gives them. |
| 🔒 **Locked-down headers** | A nonce-based CSP, `no-referrer`, `no-store` on the API, no analytics, and fonts served from our own origin. |
| 🚪 **Safe exits** | A "Leave site" button on every reporter page, and a warning before any link that leaves WhistleDrop. |
| 🛡️ **Accountable staff** | Every status change records which moderator made it. Roles are re-checked against the database on every request, and the last admin can't be removed. |
| 📖 **Documented API** | An OpenAPI 3.1 spec generated from the same Zod schemas that validate requests, with Swagger UI at `/api-docs`. |
| ✅ **Tested** | Unit tests, integration tests against a real Postgres, and end-to-end CSP tests against the production build. |

## Screenshots

<table>
  <tr>
    <th>Make a report</th>
    <th>Case code</th>
    <th>Track a case</th>
  </tr>
  <tr>
    <td><img src="whistledrop/docs/screenshots/02-report-mobile.png" alt="Report form" width="220"></td>
    <td><img src="whistledrop/docs/screenshots/03-case-code-mobile.png" alt="Case code screen" width="220"></td>
    <td><img src="whistledrop/docs/screenshots/04-track-mobile.png" alt="Tracking a case" width="220"></td>
  </tr>
</table>

<details>
<summary><b>Moderator area</b> (click to expand)</summary>

<br>

**Dashboard**

<img src="whistledrop/docs/screenshots/06-dashboard-desktop.png" alt="Moderator dashboard" width="820">

**Reports list with search and filters**

<img src="whistledrop/docs/screenshots/07-reports-desktop.png" alt="Reports list" width="820">

**Report detail**

<img src="whistledrop/docs/screenshots/08-report-detail-desktop.png" alt="Report detail" width="820">

**Moderator management (admins)**

<img src="whistledrop/docs/screenshots/09-moderators-desktop.png" alt="Moderator management" width="820">

</details>

All desktop and mobile screenshots are in [`whistledrop/docs/screenshots/`](whistledrop/docs/screenshots/).

## Quick start

```bash
git clone https://github.com/maanit-gupta/WhistleDrop.git
cd WhistleDrop/whistledrop
npm install
cp .env.example .env.local   # fill in Supabase, secrets and (optionally) Upstash
npm run db:deploy && npm run storage:setup && npm run db:seed
npm run dev                  # http://localhost:3000, API docs at /api-docs
```

To run the tests:

```bash
npm test                                         # unit tests
npm run test:db:up && npm run test:integration   # integration tests (Docker)
```

The full setup guide, including where to find each Supabase key and every environment variable, is in the [full documentation](whistledrop/README.md#local-setup).

## Documentation

The app lives in [`whistledrop/`](whistledrop/). Its [README](whistledrop/README.md) is the full submission document:

- [Architecture](whistledrop/README.md#architecture) and [status workflow](whistledrop/README.md#status-workflow)
- [How anonymity is maintained](whistledrop/README.md#how-anonymity-is-maintained) and [security decisions](whistledrop/README.md#security-decisions)
- [Evidence upload flow](whistledrop/README.md#evidence-upload-flow)
- [API reference](whistledrop/README.md#api-reference) and [curl examples for a full case lifecycle](whistledrop/README.md#example-requests-a-full-case-lifecycle)
- [Deployment on Vercel](whistledrop/README.md#deployment-vercel)
- [Known limitations](whistledrop/README.md#known-limitations)

## Acknowledgements

Built for the **GDG on Campus SRM** recruitment 2026–27 (Technical Domain). The interface follows the **"Lime Ledger"** design language.

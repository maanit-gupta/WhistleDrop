import type { Metadata } from "next";
import { NavPill } from "@/components/ui/NavPill";
import { EditorialBody, EditorialSection } from "@/components/sections/EditorialSection";
import { Footer } from "@/components/sections/Footer";
import { PageHeader } from "@/components/sections/PageHeader";

// Plain statements of what the code does, taken from the README ("How
// anonymity is maintained" and "Known limitations"). Not a legal policy.

export const metadata: Metadata = {
  title: "Privacy",
  description: "What WhistleDrop stores, what it never stores, and what it can't protect.",
};

export default function PrivacyPage() {
  return (
    <>
      <NavPill />
      <main id="main">
        <PageHeader
          lines={["Privacy"]}
          subline="What WhistleDrop keeps, what it never keeps, and the limits of what any website can promise."
        />
        <EditorialBody>
          <EditorialSection title="What is stored">
            <ul>
              <li>
                <strong>Your report:</strong> its category, description, optional evidence link, status, a random
                case code, and when it was created, last updated and closed.
              </li>
              <li>
                <strong>Status updates:</strong> the new status, the time, an optional note (public or internal),
                and which moderator made the change. Never anything about you.
              </li>
              <li>
                <strong>Evidence files:</strong> kept in private storage, with image metadata removed, until the
                case is closed.
              </li>
              <li>
                <strong>Upload records:</strong> a random token id and a time, so a file can&apos;t be attached
                twice. Nothing links them to a report or a person, and they are deleted daily.
              </li>
            </ul>
          </EditorialSection>

          <EditorialSection title="What is never stored">
            <ul>
              <li>
                No IP address, user agent, cookie, session id, device fingerprint, email address or account for
                anyone who reports: not in the database, not in file storage, not in logs. Only the form fields
                are saved, and any extra field is rejected.
              </li>
              <li>
                No raw IP address, even for rate limiting. Limits use a keyed hash of the address that changes
                every day, kept only in the rate limiter and expiring within hours.
              </li>
              <li>
                No image metadata. Every JPEG, PNG and WebP is re-encoded, removing EXIF data (including GPS
                location, camera or phone model and capture time), XMP, IPTC and embedded comments.
              </li>
            </ul>
          </EditorialSection>

          <EditorialSection title="Who can see a report">
            <p>
              <strong>Moderators</strong>, who sign in and whose account and role are re-checked on every request.
              They download evidence through links that expire after 60 seconds; files are never public.
            </p>
            <p>
              <strong>Anyone with the case code</strong> can see the category, description, evidence link, status
              and the conversation with the review team: its messages, every status change and any public note.
              Internal notes, ids and moderator details are never shown: moderators appear only as &ldquo;the
              review team&rdquo;. Reporters only ever see the case code, never an internal id.
            </p>
            <p>
              <strong>Messages you send</strong> are stored as text only, with nothing about you: no IP address,
              no hash of it, no browser details. Don&apos;t put your name or anything that identifies you in them.
            </p>
          </EditorialSection>

          <EditorialSection title="When a case closes">
            <p>
              Every evidence file is permanently deleted, and the case becomes read-only. The files are deleted
              first; if that fails, the case isn&apos;t closed. The report and its conversation stay readable with
              your case code, but no one can add to them.
            </p>
          </EditorialSection>

          <EditorialSection title="On this website">
            <ul>
              <li>No third-party scripts, analytics, trackers or embeds. Fonts are served from this site.</li>
              <li>
                The report and tracking pages set no cookies and store nothing in your browser. Your case code is
                never put in the address bar.
              </li>
              <li>
                Links to other sites show a warning first, and no referrer is sent, so the other site isn&apos;t
                told you came from here.
              </li>
              <li>
                Files go straight from your browser to private storage through a short-lived signed link, then are
                checked and cleaned when you submit.
              </li>
            </ul>
          </EditorialSection>

          <EditorialSection title="What we can't protect">
            <ul>
              <li>
                <strong>Network and hosting logs.</strong> The hosting platform, CDNs, workplace networks and your
                internet provider can record the IP address that visits or uploads, and the storage provider can
                log the address that uploads a file. If you are at risk, use Tor or a trusted VPN on a device and
                network nobody monitors.
              </li>
              <li>
                <strong>Your case code in lookups.</strong> Checking a case sends the code to the server in the
                request path, which the hosting platform&apos;s request logs may record.
              </li>
              <li>
                <strong>What you write and upload.</strong> Details, writing style or the content of evidence can
                point to you.
              </li>
              <li>
                <strong>PDF metadata.</strong> PDFs are checked but not cleaned: author, software and timestamps stay
                as uploaded. Remove them first, for example by printing to a new PDF or exporting pages as images.
              </li>
              <li>
                <strong>Timing.</strong> Submission time is stored to the millisecond. Someone with both hosting logs
                and the database could match them.
              </li>
              <li>
                <strong>A leaked case code.</strong> Whoever has it can read the report and its conversation, and send messages in it.
              </li>
              <li>
                <strong>Unsent uploads.</strong> A file uploaded without submitting the report stays in private
                storage until the daily cleanup, at most about a day.
              </li>
            </ul>
          </EditorialSection>
        </EditorialBody>
      </main>
      <Footer />
    </>
  );
}

import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { HairlineDraw } from "@/components/ui/HairlineDraw";
import { NumberedFeatureRow } from "@/components/ui/NumberedFeatureRow";
import { FadeUp, RevealHeadline } from "@/components/ui/Reveal";
import styles from "./Distinction.module.css";

// Every sentence here is checked against the backend: app/api/reports/route.ts
// (body fields only), lib/rateLimit.ts (daily-salted HMAC, Redis only),
// lib/caseCode.ts (crypto.randomBytes, 36^8), app/api/reports/[caseCode]
// (identical 404s), lib/uploads.ts (sharp re-encode; PDFs untouched) and the
// status route (files deleted on CLOSED).
export function Distinction() {
  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <EyebrowTag>Why WhistleDrop?</EyebrowTag>
        <RevealHeadline
          className={`t-h2 ${styles.title}`}
          lines={["The WhistleDrop", <span key="d" className={styles.accent}>Distinction</span>]}
        />
        <FadeUp delay={200}>
          <p className="t-body t-secondary measure">
            The safest data is data that was never collected. Here is what the code actually does with a report.
          </p>
        </FadeUp>
        <HairlineDraw className={styles.rule} />

        <NumberedFeatureRow
          number="01"
          title="No Accounts, No Identity"
          description="There is no reporter sign-up. A report is saved from the form fields alone: no IP address, cookies, device details or email. Rate limits use a hash of your IP that changes daily and never reaches the database."
        />
        <NumberedFeatureRow
          number="02"
          title="Hard-to-Guess Case Codes"
          description="Codes come from a cryptographically secure generator, one of about 2.8 trillion. Lookups are rate limited, and a wrong code gets exactly the same answer as a malformed one."
        />
        <NumberedFeatureRow
          number="03"
          title="Evidence Without Metadata"
          description="Images are re-encoded before storage, which strips EXIF data including GPS location and camera model. PDFs are checked but not cleaned, so remove their metadata first. Closing a case deletes its files."
        />
      </div>
    </section>
  );
}

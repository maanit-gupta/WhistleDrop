"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { NumberedFeatureRow } from "@/components/ui/NumberedFeatureRow";
import { PillCTA } from "@/components/ui/PillCTA";
import { RevealHeadline } from "@/components/ui/Reveal";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UnderlineInput } from "@/components/ui/UnderlineField";
import { normalizeCaseCode } from "@/lib/client/caseCode";
import { useCaseCodeHandoff } from "@/lib/client/caseCodeHandoff";
import { ROUTES } from "@/lib/site";
import styles from "./EntryPoints.module.css";

/** The three ways in: report, track, moderate. */
export function EntryPoints() {
  const router = useRouter();
  const handoff = useCaseCodeHandoff();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const track = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeCaseCode(code);
    if (!normalized) {
      setError("Case codes look like WD-XXXX-XXXX.");
      return;
    }
    // In memory only: /track reads it from the handoff, never from the URL.
    handoff.leave(normalized);
    router.push(ROUTES.track);
  };

  return (
    <section className={`surface-dark section ${styles.section}`}>
      <div className="container">
        <EyebrowTag>Where to start</EyebrowTag>
        <RevealHeadline className={`t-h2 ${styles.title}`} lines={["Three Doors,", "One Promise"]} />

        <div className={styles.rows}>
          <NumberedFeatureRow
            number="01"
            title="Submit a Report"
            description="Tell us what happened and attach evidence if you have it. You get a case code; no account, no email."
          >
            <PillCTA href={ROUTES.report} className={styles.action}>
              Start a report
            </PillCTA>
          </NumberedFeatureRow>

          <NumberedFeatureRow
            number="02"
            title="Track Your Case"
            description="Enter the code you were given to see the status and reply to the review team."
          >
            <form className={styles.trackForm} onSubmit={track} noValidate>
              <UnderlineInput
                label="Case code"
                placeholder="WD-XXXX-XXXX"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                error={error ?? undefined}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
              />
              <SubmitButton className={styles.trackButton}>Track</SubmitButton>
            </form>
          </NumberedFeatureRow>

          <NumberedFeatureRow
            number="03"
            title="Moderator Access"
            description="For authorised reviewers only. Accounts are created by an administrator; there is no public sign-up."
          >
            <Link href={ROUTES.modLogin} className={`link-u t-nav ${styles.action}`}>
              Sign in
            </Link>
          </NumberedFeatureRow>
        </div>
      </div>
    </section>
  );
}

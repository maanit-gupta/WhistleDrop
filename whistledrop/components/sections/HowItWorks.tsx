import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { FadeUp, RevealHeadline } from "@/components/ui/Reveal";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { StickyStack } from "@/components/ui/StickyStack";
import styles from "./HowItWorks.module.css";

// Mirrors the real workflow in lib/transitions.shared.ts:
// SUBMITTED → UNDER_REVIEW → RESOLVED | DISMISSED → CLOSED.
const STEPS = [
  {
    title: "Submit",
    description: "Describe what happened, add evidence if you have it, and keep the case code you get.",
  },
  {
    title: "Review",
    description: "A moderator moves your report to Under review and may message you through your case code.",
  },
  {
    title: "Resolution",
    description: "It ends Resolved or Dismissed, then Closed: read-only, with its evidence files deleted.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className={`surface-dark section ${styles.section}`}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.intro}>
          <EyebrowTag>How it works</EyebrowTag>
          <RevealHeadline className={`t-h2 ${styles.title}`} lines={["Precision in", "Every Step"]} />
          <FadeUp delay={200}>
            <p className="t-body t-secondary measure">
              Every report follows one fixed path: Submitted, Under review, then Resolved or Dismissed, and finally
              Closed. Steps can&apos;t be skipped or undone.
            </p>
          </FadeUp>
        </div>
        <div className={styles.cards}>
          <StickyStack top={120}>
            {STEPS.map((step, i) => (
              <ServiceCard
                key={step.title}
                title={step.title}
                numeral={`0${i + 1}`}
                description={step.description}
                accent={i === STEPS.length - 1}
              />
            ))}
          </StickyStack>
        </div>
      </div>
    </section>
  );
}

import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { RevealHeadline } from "@/components/ui/Reveal";
import { SlideTilePair, type Slide } from "@/components/ui/SlideTile";
import styles from "./Promises.module.css";

// Real guarantees only (README → "How anonymity is maintained"). WhistleDrop
// has no testimonials and never shows invented quotes.
const PROMISES: Slide[] = [
  {
    label: "What we store",
    statement:
      "Your category, description, optional evidence link and files, the case's status history and timestamps. The case code is linked to nothing else.",
    subLabel: "Only the fields in the form",
    bars: [0.22, 0.34, 0.28, 0.46, 0.4, 0.58, 0.52, 0.7, 0.64, 0.86],
  },
  {
    label: "What we never store",
    statement:
      "No IP address, cookie, session, user agent, device fingerprint, email or account. Image metadata such as GPS location is stripped before storage.",
    subLabel: "Rate limits use a daily-changing hash, kept only briefly",
    bars: [0.5, 0.4, 0.62, 0.3, 0.7, 0.55, 0.8, 0.45, 0.66, 0.5],
  },
  {
    label: "Who can see your report",
    statement:
      "Signed-in moderators, whose access is re-checked on every request. With your case code you see the status and your conversation with the review team; internal notes and moderator details stay hidden.",
    subLabel: "Anyone holding your code can read the report, so keep it private",
    bars: [0.3, 0.52, 0.44, 0.68, 0.36, 0.6, 0.74, 0.48, 0.82, 0.58],
  },
  {
    label: "When a case closes",
    statement:
      "Every evidence file is permanently deleted and the case becomes read-only. Your code still shows its history.",
    subLabel: "Files are deleted before the case is marked closed",
    bars: [0.9, 0.78, 0.7, 0.6, 0.52, 0.44, 0.35, 0.28, 0.2, 0.12],
  },
];

export function Promises() {
  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <div className={styles.head}>
          <EyebrowTag>Our promises</EyebrowTag>
          <RevealHeadline className={`t-h2 ${styles.title}`} lines={["Privacy, By Design"]} />
        </div>
        <SlideTilePair slides={PROMISES} label="What WhistleDrop promises" className={styles.carousel} />
      </div>
    </section>
  );
}

import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { FadeUp, RevealHeadline } from "@/components/ui/Reveal";
import { DEMO_CHAPTERS, DEMO_VIDEO_DURATION } from "@/lib/demo";
import { DemoPlayer } from "./DemoPlayer";
import styles from "./Demo.module.css";

// The recorded walkthrough (npm run record:demo). The video is a local file
// with a native player: no external hosting, no third-party player, no
// autoplay. Chapter times come from the recording script via lib/demo.ts.
export function Demo() {
  return (
    <section id="demo" className={`section ${styles.section}`} aria-labelledby="demo-title">
      <div className="container">
        <EyebrowTag>See it work</EyebrowTag>
        <RevealHeadline id="demo-title" className={`t-h2 ${styles.title}`} lines={["The Whole Journey,", "In Three Minutes"]} />
        <FadeUp delay={200}>
          <p className={`t-body ${styles.lede}`}>
            A real session recorded on this app: a report with evidence, the case code, an anonymous conversation between
            the reporter and a moderator, and the case being closed for good. Waits for the network are trimmed and
            captions added; there is no sound.
          </p>
        </FadeUp>
        <FadeUp delay={300}>
          <DemoPlayer chapters={DEMO_CHAPTERS} duration={DEMO_VIDEO_DURATION} />
        </FadeUp>
      </div>
    </section>
  );
}

import { BlockCTA } from "@/components/ui/BlockCTA";
import { FadeUp, RevealHeadline } from "@/components/ui/Reveal";
import { PleatedFan } from "@/components/visuals/PleatedFan";
import { ROUTES } from "@/lib/site";
import styles from "./Hero.module.css";

/** White headline band over a full-bleed pleated fan in the lime wash. */
export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`surface-light ${styles.top}`}>
        <div className={`container ${styles.grid}`}>
          <RevealHeadline as="h1" className={`t-h1 ${styles.title}`} lines={["Speak Without", "Being Seen"]} />
          <div className={styles.aside}>
            <FadeUp delay={240}>
              <p className={styles.subline}>Report wrongdoing anonymously. No account, no email, no IP address kept.</p>
            </FadeUp>
            <BlockCTA href={ROUTES.report} className={styles.cta}>
              Submit a report
            </BlockCTA>
          </div>
        </div>
      </div>
      <div className={styles.media}>
        <PleatedFan parallax="hero" />
      </div>
    </section>
  );
}

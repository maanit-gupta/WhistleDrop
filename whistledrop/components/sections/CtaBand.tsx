import { HairlineDraw } from "@/components/ui/HairlineDraw";
import { OutlineOnLimeCTA } from "@/components/ui/OutlineOnLimeCTA";
import { RevealHeadline } from "@/components/ui/Reveal";
import { PleatedFan } from "@/components/visuals/PleatedFan";
import { ROUTES } from "@/lib/site";
import styles from "./CtaBand.module.css";

export function CtaBand() {
  return (
    <section className={`surface-lime-wash ${styles.band}`}>
      <div className={styles.fan}>
        <PleatedFan />
      </div>
      <div className={`container ${styles.head}`}>
        <RevealHeadline className="t-h2" lines={["Something Wrong?", "Say It Safely."]} />
      </div>
      <HairlineDraw className={styles.rule} />
      <div className={`container ${styles.foot}`}>
        <p className={styles.copy}>It takes a few minutes. You won&apos;t need an account or an email address.</p>
        <OutlineOnLimeCTA href={ROUTES.report}>Report Now</OutlineOnLimeCTA>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { NavPill } from "@/components/ui/NavPill";
import { HairlineDraw } from "@/components/ui/HairlineDraw";
import { PillCTA } from "@/components/ui/PillCTA";
import { RevealHeadline } from "@/components/ui/Reveal";
import { ROUTES } from "@/lib/site";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Nothing Here",
};

export default function NotFound() {
  return (
    <>
      <NavPill />
      <main id="main" className={`surface-light ${styles.page}`}>
        <div className="container">
          <RevealHeadline as="h1" className={`t-h1 ${styles.title}`} lines={["Nothing Here"]} />
          <HairlineDraw>
            <div className={styles.foot}>
              <p className={styles.copy}>This page doesn&apos;t exist, or it has moved.</p>
              <PillCTA href={ROUTES.home}>Back to Home</PillCTA>
            </div>
          </HairlineDraw>
        </div>
      </main>
    </>
  );
}

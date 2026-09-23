import type { Metadata } from "next";
import { NavPill } from "@/components/ui/NavPill";
import { Footer } from "@/components/sections/Footer";
import { PageHeader } from "@/components/sections/PageHeader";
import { DiagonalRibbons } from "@/components/visuals/DiagonalRibbons";
import { ReportForm } from "./ReportForm";
import styles from "./report.module.css";

export const metadata: Metadata = {
  title: "Make a Report",
  description: "Report wrongdoing anonymously. No account, no email; you get a case code only you hold.",
};

export default function ReportPage() {
  return (
    <>
      <NavPill />
      <main id="main">
        <PageHeader
          lines={["Make a Report"]}
          rule="short"
          subline="Your identity is never collected. Use a personal device and network if you can."
        />
        <div className={`surface-lime ${styles.band}`} aria-hidden="true" />
        <div className={styles.ribbons}>
          <DiagonalRibbons parallax="soft" />
        </div>
        <ReportForm />
      </main>
      <Footer />
    </>
  );
}

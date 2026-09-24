import type { Metadata } from "next";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { NavPill } from "@/components/ui/NavPill";
import { isDemoMode } from "@/lib/env";
import { Footer } from "@/components/sections/Footer";
import { PageHeader } from "@/components/sections/PageHeader";
import { TrackCase } from "./TrackCase";

export const metadata: Metadata = {
  title: "Track Your Case",
  description: "Check the status of a WhistleDrop report with its case code.",
};

export default function TrackPage() {
  const demoMode = isDemoMode();
  return (
    <>
      {demoMode && <DemoBanner />}
      <NavPill />
      <main id="main">
        <PageHeader
          lines={["Track Your Case"]}
          subline="Enter the case code you were given to see the status and talk to the review team, anonymously."
        />
        <TrackCase />
      </main>
      <Footer />
    </>
  );
}

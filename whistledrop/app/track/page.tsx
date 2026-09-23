import type { Metadata } from "next";
import { NavPill } from "@/components/ui/NavPill";
import { Footer } from "@/components/sections/Footer";
import { PageHeader } from "@/components/sections/PageHeader";
import { TrackCase } from "./TrackCase";

export const metadata: Metadata = {
  title: "Track Your Case",
  description: "Check the status of a WhistleDrop report with its case code.",
};

export default function TrackPage() {
  return (
    <>
      <NavPill />
      <main id="main">
        <PageHeader
          lines={["Track Your Case"]}
          subline="Enter the case code you were given to see the status and any public updates."
        />
        <TrackCase />
      </main>
      <Footer />
    </>
  );
}

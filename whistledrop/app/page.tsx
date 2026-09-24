import { DemoBanner } from "@/components/ui/DemoBanner";
import { NavPill } from "@/components/ui/NavPill";
import { isDemoMode } from "@/lib/env";
import { CtaBand } from "@/components/sections/CtaBand";
import { Demo } from "@/components/sections/Demo";
import { Distinction } from "@/components/sections/Distinction";
import { EntryPoints } from "@/components/sections/EntryPoints";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Promises } from "@/components/sections/Promises";

export default function Home() {
  const demoMode = isDemoMode();
  return (
    <>
      {demoMode && <DemoBanner />}
      <NavPill />
      <main id="main">
        <Hero />
        <EntryPoints />
        <HowItWorks />
        <Distinction />
        <Demo />
        <Promises />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}

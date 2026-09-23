import { NavPill } from "@/components/ui/NavPill";
import { CtaBand } from "@/components/sections/CtaBand";
import { Distinction } from "@/components/sections/Distinction";
import { EntryPoints } from "@/components/sections/EntryPoints";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Promises } from "@/components/sections/Promises";

export default function Home() {
  return (
    <>
      <NavPill />
      <main id="main">
        <Hero />
        <EntryPoints />
        <HowItWorks />
        <Distinction />
        <Promises />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}

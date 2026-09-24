import type { Metadata } from "next";
import { Suspense } from "react";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { ReportsList } from "./ReportsList";
import mod from "../mod.module.css";

export const metadata: Metadata = { title: "Reports" };

export default function ModReportsPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className={`surface-dark container ${mod.page}`}>
          <HairlineShimmer rows={6} label="Loading reports" />
        </main>
      }
    >
      <ReportsList />
    </Suspense>
  );
}

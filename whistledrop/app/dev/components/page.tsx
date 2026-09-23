import type { Metadata } from "next";
import { DevComponents } from "./DevComponents";

// TEMPORARY (Part 1 only): every component on one page for visual checks.
// Delete this folder in Part 3.

export const metadata: Metadata = {
  title: "Component check",
  robots: { index: false, follow: false },
};

export default function DevComponentsPage() {
  return <DevComponents />;
}

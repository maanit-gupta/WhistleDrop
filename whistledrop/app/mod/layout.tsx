import type { Metadata } from "next";
import { ModShell } from "./ModShell";

export const metadata: Metadata = {
  title: { default: "Moderators", template: "%s · Moderators · WhistleDrop" },
  robots: { index: false, follow: false },
};

/** Moderator area: dark pages, moderator nav, no QuickExit. The guard is client-side (the token lives in sessionStorage). */
export default function ModLayout({ children }: LayoutProps<"/mod">) {
  return <ModShell>{children}</ModShell>;
}

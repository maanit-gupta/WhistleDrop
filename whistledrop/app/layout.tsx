import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Barlow, Inter_Tight } from "next/font/google";
import { QuickExit } from "@/components/ui/QuickExit";
import { SITE } from "@/lib/site";
import { CaseCodeHandoffProvider } from "@/lib/client/caseCodeHandoff";
import "./styles/tokens.css";
import "./styles/globals.css";

// next/font downloads these at build time and serves them from this origin
// (/_next/static/media), so browsers never contact Google: font-src 'self'
// stays sufficient and no visit is disclosed to a third party.

/** Display, headings and body (open-source stand-in for Helvetica Now Display / Neue Haas Grotesk Display). */
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-inter-tight",
  display: "swap",
});

/** UI, nav and labels (stand-in for DIN Next). */
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${SITE.name} / ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request: the CSP nonce from proxy.ts only exists at
  // request time, and a statically prerendered page would carry no nonce.
  await connection();
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${interTight.variable} ${barlow.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <CaseCodeHandoffProvider>{children}</CaseCodeHandoffProvider>
        <QuickExit />
      </body>
    </html>
  );
}

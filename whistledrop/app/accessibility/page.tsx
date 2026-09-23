import type { Metadata } from "next";
import { NavPill } from "@/components/ui/NavPill";
import { EditorialBody, EditorialSection } from "@/components/sections/EditorialSection";
import { Footer } from "@/components/sections/Footer";
import { PageHeader } from "@/components/sections/PageHeader";

// Only measures that exist in the code (components/ui, hooks, app/styles).

export const metadata: Metadata = {
  title: "Accessibility",
  description: "The accessibility measures built into WhistleDrop.",
};

export default function AccessibilityPage() {
  return (
    <>
      <NavPill />
      <main id="main">
        <PageHeader
          lines={["Accessibility"]}
          subline="The measures built into this site. This describes the code; it isn't a formal conformance statement."
        />
        <EditorialBody>
          <EditorialSection title="Keyboard">
            <ul>
              <li>A “Skip to content” link is the first thing on every page.</li>
              <li>Every control is a real link, button or form field, with a visible 2px focus ring.</li>
              <li>
                Dialogs and the mobile menu keep focus inside while open, close with Esc, and return focus to
                where you were.
              </li>
              <li>Carousels have labelled previous and next buttons, and respond to the arrow keys.</li>
              <li>A busy submit button stays focusable, so focus isn&apos;t lost while a form is sending.</li>
            </ul>
          </EditorialSection>

          <EditorialSection title="Forms">
            <ul>
              <li>Every field has a visible label; required fields are marked and flagged to assistive technology.</li>
              <li>
                Errors are written out in words, linked to their field and announced. After a failed submit, focus
                moves to the first field that needs attention.
              </li>
              <li>The description counter is announced only as you approach the limit, not on every keystroke.</li>
              <li>File uploads report their progress to screen readers.</li>
            </ul>
          </EditorialSection>

          <EditorialSection title="Screen readers">
            <ul>
              <li>Pages declare their language and use headings in order.</li>
              <li>Loading states are announced as status messages and errors as alerts.</li>
              <li>Decorative artwork is hidden from assistive technology.</li>
              <li>Links to other sites say that a warning comes first.</li>
            </ul>
          </EditorialSection>

          <EditorialSection title="Motion">
            <p>
              If your system asks for reduced motion, parallax, looping animation and staggered reveals are turned
              off and content appears at once. Content is never hidden if JavaScript doesn&apos;t run.
            </p>
          </EditorialSection>

          <EditorialSection title="Colour and layout">
            <ul>
              <li>
                Grey secondary text is used only on dark backgrounds, where it meets WCAG AA contrast. On light
                backgrounds, secondary text stays dark.
              </li>
              <li>Colour is never the only signal: errors, status and required fields also use text or symbols.</li>
              <li>Pages reflow down to phone widths, and zooming isn&apos;t blocked.</li>
            </ul>
          </EditorialSection>

          <EditorialSection title="Leave site">
            <p>
              The “Leave site” button in the corner of every page swaps the current page for a search engine, so
              Back doesn&apos;t return to it. Other WhistleDrop pages you opened in that tab stay in its history.
            </p>
          </EditorialSection>
        </EditorialBody>
      </main>
      <Footer />
    </>
  );
}

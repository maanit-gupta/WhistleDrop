"use client";

import { useEffect, useState } from "react";

// Page transition: on client-side navigation the screen flashes to
// --paper-warm for 250ms, then the new page fades in. The very first page
// load doesn't flash. Reduced motion turns it off (app/styles/globals.css).

// Module state survives template remounts (one per navigation) but not a
// full page load, which is exactly "has this tab navigated client-side yet?".
let hasMounted = false;

export default function Template({ children }: { children: React.ReactNode }) {
  // Read once at mount. On the server and during hydration this is false,
  // so server and client markup match.
  const [animate] = useState(() => hasMounted);

  useEffect(() => {
    hasMounted = true;
  }, []);

  return (
    <div className="page-transition" data-animate={animate}>
      <div className="page-flash" aria-hidden="true" />
      <div className="page-content">{children}</div>
    </div>
  );
}

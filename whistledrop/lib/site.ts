// Site-wide constants for the frontend. Browser-safe: no secrets, no runtime
// imports.

export const SITE = {
  name: "WhistleDrop",
  tagline: "Anonymous Reporting",
  description: "Report wrongdoing anonymously. No account, no tracking: just a case code only you hold.",
} as const;

/** TODO: fill in with the public repository URL (shown so people can audit the code). */
export const GITHUB_REPO_URL = "https://github.com/maanit-gupta/WhistleDrop";

/** The public demo sign-ins for reviewers (whistledrop/DUMMY_SIGN_INS.txt on the default branch). */
export const DEMO_SIGN_INS_URL = `${GITHUB_REPO_URL}/blob/main/whistledrop/DUMMY_SIGN_INS.txt`;

/** Where the "Leave site" button goes. location.replace() keeps WhistleDrop out of Back history. */
export const QUICK_EXIT_URL = "https://www.google.com";

/**
 * Page routes. The pages themselves arrive in Parts 2 and 3; every link in the
 * UI goes through this map so a path changes in one place.
 * Case codes are NEVER part of a route or query string.
 */
export const ROUTES = {
  home: "/",
  /** The walkthrough video section on the home page; works from any page. */
  demo: "/#demo",
  report: "/report",
  track: "/track",
  modLogin: "/mod/login",
  modDashboard: "/mod",
  modReports: "/mod/reports",
  modReport: (id: string) => `/mod/reports/${encodeURIComponent(id)}`,
  modModerators: "/mod/moderators",
  privacy: "/privacy",
  accessibility: "/accessibility",
  /** Swagger UI, served by a route handler: link with a plain <a>, not next/link. */
  apiDocs: "/api-docs",
} as const;

export interface NavLink {
  href: string;
  label: string;
}

export const PUBLIC_NAV: readonly NavLink[] = [
  { href: ROUTES.home, label: "Home" },
  { href: ROUTES.report, label: "Report" },
  { href: ROUTES.track, label: "Track" },
  { href: ROUTES.demo, label: "Demo" },
  { href: ROUTES.modLogin, label: "Moderators" },
];

export const MODERATOR_NAV: readonly NavLink[] = [
  { href: ROUTES.modDashboard, label: "Dashboard" },
  { href: ROUTES.modReports, label: "Reports" },
];

/** Shown only when the (UI-decoded) role is ADMIN; the API enforces it regardless. */
export const ADMIN_NAV_LINK: NavLink = { href: ROUTES.modModerators, label: "Moderators" };

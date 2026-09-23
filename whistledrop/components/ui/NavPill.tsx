"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Monogram } from "@/components/visuals/Monogram";
import { PillCTA } from "@/components/ui/PillCTA";
import { cx } from "@/components/ui/Action";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { ADMIN_NAV_LINK, MODERATOR_NAV, PUBLIC_NAV, ROUTES, SITE, type NavLink } from "@/lib/site";
import styles from "./NavPill.module.css";

export type NavPillProps =
  | { variant?: "public"; heroThreshold?: number }
  | {
      variant: "moderator";
      /** Show the ADMIN-only "Moderators" link. A UI hint only: the API enforces the role. */
      showAdminLink?: boolean;
      onSignOut: () => void;
      heroThreshold?: number;
    };

/** The longest nav href that matches the current path, so /mod doesn't light up on /mod/reports. */
function activeHref(pathname: string, links: readonly NavLink[]): string | null {
  const matches = links
    .map((l) => l.href)
    .filter((href) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Floating nav. Fades to 40% with an 8px backdrop blur while scrolling down
 * past the hero; back to full on scroll-up, hover or keyboard focus.
 * Below 768px: logo, a lime "Report" pill (public) and a menu button that opens
 * a full-screen menu.
 */
export function NavPill(props: NavPillProps) {
  const moderator = props.variant === "moderator";
  const links: readonly NavLink[] = moderator
    ? [...MODERATOR_NAV, ...(props.showAdminLink ? [ADMIN_NAV_LINK] : [])]
    : PUBLIC_NAV;

  const pathname = usePathname();
  const current = activeHref(pathname, links);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const { direction, pastThreshold } = useScrollDirection(props.heroThreshold);
  const dimmed = pastThreshold && direction === "down" && !menuOpen;

  const closeMenu = () => setMenuOpen(false);
  useFocusTrap(menuRef, menuOpen, closeMenu);

  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [menuOpen]);

  const signOut = moderator ? props.onSignOut : undefined;

  const brand = (
    <Link href={moderator ? ROUTES.modDashboard : ROUTES.home} className={styles.brand} onClick={closeMenu}>
      <Monogram size={34} />
      <span className={styles.wordmark}>
        <span>{SITE.name}</span>
        <span>{SITE.tagline}</span>
      </span>
    </Link>
  );

  return (
    <header className={styles.wrap}>
      <nav className={styles.pill} data-dimmed={dimmed} aria-label="Main">
        {brand}

        <ul className={styles.links} role="list">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cx(styles.link, "link-u")}
                aria-current={current === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          {moderator ? (
            <button type="button" className={cx(styles.signOut, styles.desktopOnly)} onClick={signOut}>
              Sign out
            </button>
          ) : (
            <>
              <PillCTA href={ROUTES.report} className={styles.desktopOnly}>
                Submit a Report
              </PillCTA>
              <PillCTA href={ROUTES.report} size="sm" className={styles.mobileOnly}>
                Report
              </PillCTA>
            </>
          )}
          <button
            type="button"
            className={cx(styles.burger, styles.mobileOnly)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen(true)}
          >
            <span className="visually-hidden">Open menu</span>
            <span className={styles.burgerLines} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div ref={menuRef} id={menuId} className={styles.menu} role="dialog" aria-modal="true" aria-label="Menu">
          <div className={styles.menuTop}>
            {brand}
            <button type="button" className={styles.close} onClick={closeMenu}>
              <span className="visually-hidden">Close menu</span>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <ul className={styles.menuLinks} role="list">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cx(styles.menuLink, "link-u")}
                  aria-current={current === link.href ? "page" : undefined}
                  onClick={closeMenu}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className={styles.menuFooter}>
            {moderator ? (
              <button
                type="button"
                className={styles.signOut}
                onClick={() => {
                  closeMenu();
                  signOut?.();
                }}
              >
                Sign out
              </button>
            ) : (
              <PillCTA href={ROUTES.report} onClick={closeMenu}>
                Submit a Report
              </PillCTA>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

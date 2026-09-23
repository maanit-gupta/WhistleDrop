import Link from "next/link";
import { LeaveSiteLink } from "@/components/ui/LeaveSiteModal";
import { Monogram } from "@/components/visuals/Monogram";
import { GITHUB_REPO_URL, ROUTES, SITE } from "@/lib/site";
import styles from "./Footer.module.css";

/** Reporter-page footer. Contact details are deliberately absent: there are none to publish. */
export function Footer() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className={`surface-dark ${styles.footer}`}>
      <div className="container">
        <div className={styles.brand}>
          <Monogram size={48} />
          <span className={styles.wordmark}>{SITE.name}</span>
        </div>

        <div className={styles.bottom}>
          <div className={styles.columns}>
            <div>
              <h2 className={styles.heading}>Report</h2>
              <ul role="list" className={styles.list}>
                <li><Link href={ROUTES.report} className="link-u">Submit</Link></li>
                <li><Link href={ROUTES.track} className="link-u">Track</Link></li>
              </ul>
            </div>
            <div>
              <h2 className={styles.heading}>Moderators</h2>
              <ul role="list" className={styles.list}>
                <li><Link href={ROUTES.modLogin} className="link-u">Sign in</Link></li>
                {/* A route handler, not a page: a full navigation. */}
                <li><a href={ROUTES.apiDocs} className="link-u">API docs</a></li>
              </ul>
            </div>
            <div>
              <h2 className={styles.heading}>Project</h2>
              <ul role="list" className={styles.list}>
                <li><LeaveSiteLink href={GITHUB_REPO_URL}>Source on GitHub</LeaveSiteLink></li>
              </ul>
            </div>
            <div>
              <h2 className={styles.heading}>Legal</h2>
              <ul role="list" className={styles.list}>
                <li><Link href={ROUTES.privacy} className="link-u">Privacy</Link></li>
                <li><Link href={ROUTES.accessibility} className="link-u">Accessibility</Link></li>
              </ul>
            </div>
          </div>
          <p className={styles.copyright}>© {year} {SITE.name}</p>
        </div>
      </div>
    </footer>
  );
}

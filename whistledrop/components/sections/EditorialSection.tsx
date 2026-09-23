import type { ReactNode } from "react";
import { RevealHeadline } from "@/components/ui/Reveal";
import styles from "./EditorialSection.module.css";

export interface EditorialSectionProps {
  title: string;
  children: ReactNode;
}

/** One titled block of a long-form page (Privacy, Accessibility): heading left, prose right. */
export function EditorialSection({ title, children }: EditorialSectionProps) {
  return (
    <section className={styles.block}>
      <RevealHeadline className={`t-h3 ${styles.title}`} lines={[title]} />
      <div className={styles.prose}>{children}</div>
    </section>
  );
}

/** Dark body that holds EditorialSections. */
export function EditorialBody({ children }: { children: ReactNode }) {
  return (
    <div className="surface-dark section">
      <div className={`container ${styles.body}`}>{children}</div>
    </div>
  );
}

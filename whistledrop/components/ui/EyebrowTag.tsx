import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./EyebrowTag.module.css";

export function EyebrowTag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.tag, className)}>{children}</span>;
}

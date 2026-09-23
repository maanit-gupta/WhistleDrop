import { Action, cx, type ActionProps } from "@/components/ui/Action";
import styles from "./BlockCTA.module.css";

/** Black, sharp-cornered, full column width, 68px. Hover: label shifts 6px right. */
export function BlockCTA({ className, children, ...props }: ActionProps) {
  return (
    <Action {...(props as ActionProps)} className={cx(styles.block, className)}>
      <span className={styles.label}>{children}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
    </Action>
  );
}

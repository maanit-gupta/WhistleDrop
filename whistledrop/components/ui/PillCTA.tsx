import { Action, cx, type ActionProps } from "@/components/ui/Action";
import styles from "./PillCTA.module.css";

export type PillCTAProps = ActionProps & { size?: "md" | "sm" };

/** Primary lime pill. Hover: underline slides in left to right, background brightens. */
export function PillCTA({ size = "md", className, children, ...props }: PillCTAProps) {
  return (
    <Action {...(props as ActionProps)} className={cx(styles.pill, size === "sm" && styles.sm, className)}>
      <span className={styles.label}>{children}</span>
    </Action>
  );
}

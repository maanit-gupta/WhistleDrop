import { Action, cx, type ActionProps } from "@/components/ui/Action";
import styles from "./OutlineOnLimeCTA.module.css";

/** For lime surfaces: ink block, lime label, 180×56, sharp corners. */
export function OutlineOnLimeCTA({ className, children, ...props }: ActionProps) {
  return (
    <Action {...(props as ActionProps)} className={cx(styles.cta, className)}>
      <span className={styles.label}>{children}</span>
    </Action>
  );
}

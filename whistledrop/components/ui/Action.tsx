import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

// Shared link-or-button rendering for the CTA components. With `href` it's a
// Next.js <Link> (internal routes only: external links go through
// LeaveSiteModal); without, a <button type="button">.

interface Common {
  children: ReactNode;
  className?: string;
}
export type ActionLinkProps = Common & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;
export type ActionButtonProps = Common & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;
export type ActionProps = ActionLinkProps | ActionButtonProps;

export function Action(props: ActionProps) {
  if (props.href !== undefined) {
    const { href, children, className, ...rest } = props;
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  const { children, className, type = "button", ...rest } = props;
  return (
    <button type={type} className={className} {...rest}>
      {children}
    </button>
  );
}

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

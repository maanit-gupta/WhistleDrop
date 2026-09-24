import type { Metadata } from "next";
import { NavPill } from "@/components/ui/NavPill";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Moderator sign-in for WhistleDrop.",
};

// The public nav variant: a signed-out visitor has nothing to sign out of, and
// "Moderators" (this page) is lit as the current link.
export default function ModLoginPage() {
  return (
    <>
      <NavPill />
      <LoginForm />
    </>
  );
}

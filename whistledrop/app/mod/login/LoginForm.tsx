"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UnderlineInput } from "@/components/ui/UnderlineField";
import { login, type ApiFailure } from "@/lib/client/api";
import { formatWait } from "@/lib/client/labels";
import { getSession, setToken } from "@/lib/client/session";
import { ROUTES } from "@/lib/site";
import mod from "../mod.module.css";
import styles from "./login.module.css";

function failureMessage(failure: ApiFailure): string {
  switch (failure.status) {
    case 400:
    case 401:
      // One message for a wrong email, a wrong password and a deactivated account, as the API does.
      return "Those details didn't work. Check them and try again.";
    case 429:
      return `Too many sign-in attempts. Please try again ${formatWait(failure.retryAfterSeconds)}.`;
    case 0:
      return failure.message;
    default:
      return "Sign-in isn't available right now. Please try again shortly.";
  }
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Already signed in in this tab: skip the form.
  useEffect(() => {
    if (getSession()) router.replace(ROUTES.modDashboard);
  }, [router]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    setError(null);
    if (errors.email || errors.password) return;

    setBusy(true);
    const result = await login({ email: email.trim(), password });
    if (result.ok) {
      setToken(result.data.token);
      router.replace(ROUTES.modDashboard);
      return;
    }
    setBusy(false);
    setPassword("");
    setError(failureMessage(result));
  };

  return (
    <main id="main" className={`surface-dark ${styles.wrap}`}>
      <section className={styles.panel} aria-labelledby="mod-login-title">
        <EyebrowTag>Authorised reviewers only</EyebrowTag>
        <h1 id="mod-login-title" className={`t-h2 ${styles.title}`}>
          Moderator Sign In
        </h1>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <UnderlineInput
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            error={fieldErrors.email}
          />
          <UnderlineInput
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            error={fieldErrors.password}
          />
          {error && (
            <p ref={errorRef} className={mod.alert} role="alert" tabIndex={-1}>
              {error}
            </p>
          )}
          <SubmitButton loading={busy} loadingLabel="Signing in…">
            Sign In
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}

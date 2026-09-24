"use client";

import type { ModeratorRole } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import timeline from "@/components/ui/StatusTimeline.module.css";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UnderlineInput, UnderlineSelect } from "@/components/ui/UnderlineField";
import {
  createModerator,
  listModerators,
  updateModerator,
  type Moderator,
  type UpdateModeratorInput,
} from "@/lib/client/api";
import { formatShortDate } from "@/lib/client/labels";
import { NotPermitted, useModSession } from "../ModShell";
import mod from "../mod.module.css";
import styles from "./moderators.module.css";

// ADMIN only. The role check here only decides what to render; the API
// answers 403 to anyone else, and that shows the same panel.

const PASSWORD_MIN = 12;
const PASSWORD_MAX_BYTES = 72;

const ROLE_LABELS: Record<ModeratorRole, string> = { ADMIN: "Admin", MODERATOR: "Moderator" };
const ROLE_OPTIONS = [
  { value: "MODERATOR", label: "Moderator" },
  { value: "ADMIN", label: "Admin" },
];

type Load = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "ready"; items: Moderator[] };
type RowState = { pending: boolean; error: string | null };

export function Moderators() {
  const { session, reportFailure } = useModSession();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [announcement, setAnnouncement] = useState("");
  const isAdmin = session.role === "ADMIN";

  const fetchList = useCallback(
    (signal?: AbortSignal) =>
      void listModerators({ signal }).then((r) => {
        if (signal?.aborted) return;
        if (r.ok) setLoad({ kind: "ready", items: r.data.items });
        else {
          reportFailure(r);
          setLoad({ kind: "failed", message: r.message });
        }
      }),
    [reportFailure],
  );

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetchList(controller.signal);
    return () => controller.abort();
  }, [isAdmin, fetchList]);

  if (!isAdmin) return <NotPermitted />;

  const replace = (updated: Moderator) =>
    setLoad((l) => (l.kind === "ready" ? { ...l, items: l.items.map((m) => (m.id === updated.id ? updated : m)) } : l));

  const change = async (m: Moderator, body: UpdateModeratorInput, done: string) => {
    setRows((s) => ({ ...s, [m.id]: { pending: true, error: null } }));
    const r = await updateModerator(m.id, body);
    if (r.ok) {
      replace(r.data);
      setRows((s) => ({ ...s, [m.id]: { pending: false, error: null } }));
      setAnnouncement(`${r.data.email} ${done}.`);
      return;
    }
    reportFailure(r);
    // CANNOT_MODIFY_SELF / DEMO_ACCOUNT_* (403) and LAST_ADMIN (409) come with a message written for people; show it as is.
    setRows((s) => ({ ...s, [m.id]: { pending: false, error: r.message } }));
  };

  const columns: DataColumn<Moderator>[] = [
    {
      key: "email",
      header: "Email",
      cell: (m) => (
        <span className={styles.email}>
          {m.email}
          {m.id === session.id && <span className={styles.you}> (you)</span>}
          {m.isDemo && (
            <>
              {" "}
              <span className={timeline.badge}>Demo</span>
            </>
          )}
        </span>
      ),
    },
    { key: "role", header: "Role", cell: (m) => ROLE_LABELS[m.role] },
    { key: "active", header: "Status", cell: (m) => (m.isActive ? "Active" : "Deactivated") },
    { key: "created", header: "Created", cell: (m) => formatShortDate(m.createdAt) },
    {
      key: "actions",
      header: <span className="visually-hidden">Actions</span>,
      align: "end",
      cell: (m) => {
        const state = rows[m.id];
        const nextRole: ModeratorRole = m.role === "ADMIN" ? "MODERATOR" : "ADMIN";
        // The server refuses any role or status change to a demo account; don't offer one.
        if (m.isDemo) {
          return <span className={styles.you}>Protected demo account</span>;
        }
        return (
          <div className={styles.actions}>
            <div className={styles.buttons}>
              <button
                type="button"
                className="link-u t-nav"
                disabled={state?.pending}
                onClick={() => void change(m, { role: nextRole }, `is now ${ROLE_LABELS[nextRole].toLowerCase()}`)}
              >
                {nextRole === "ADMIN" ? "Make admin" : "Make moderator"}
                <span className="visually-hidden"> ({m.email})</span>
              </button>
              <button
                type="button"
                className="link-u t-nav"
                disabled={state?.pending}
                onClick={() =>
                  void change(m, { isActive: !m.isActive }, m.isActive ? "was deactivated" : "was reactivated")
                }
              >
                {m.isActive ? "Deactivate" : "Reactivate"}
                <span className="visually-hidden"> ({m.email})</span>
              </button>
            </div>
            {state?.error && (
              <p className={`${mod.alert} ${styles.rowError}`} role="alert">
                {state.error}
              </p>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <main id="main" className={`surface-dark container ${mod.page}`}>
      <header className={mod.head}>
        <EyebrowTag>Administration</EyebrowTag>
        <h1 className="t-h2">Moderators</h1>
      </header>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <section aria-labelledby="mods-list">
        <h2 id="mods-list" className={mod.subheading}>
          Accounts
        </h2>
        {load.kind === "loading" && <HairlineShimmer rows={4} label="Loading moderators" />}
        {load.kind === "failed" && (
          <ErrorState
            message={load.message}
            action={
              <button type="button" className="link-u t-nav" onClick={() => fetchList()}>
                Try again
              </button>
            }
          />
        )}
        {load.kind === "ready" && (
          <DataTable caption="Moderator accounts" columns={columns} rows={load.items} rowKey={(m) => m.id} />
        )}
        <p className={styles.note}>
          Accounts are never deleted, only deactivated. Role and status changes apply to the next request that
          account makes.
        </p>
      </section>

      <CreateModerator
        onCreated={(m) => {
          setLoad((l) => (l.kind === "ready" ? { ...l, items: [...l.items, m] } : l));
          setAnnouncement(`${m.email} was added.`);
        }}
      />
    </main>
  );
}

function CreateModerator({ onCreated }: { onCreated: (m: Moderator) => void }) {
  const { reportFailure } = useModSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ModeratorRole>("MODERATOR");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < PASSWORD_MIN) next.password = `At least ${PASSWORD_MIN} characters.`;
    else if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) next.password = "That password is too long.";
    setErrors(next);
    if (next.email || next.password) return;

    setBusy(true);
    const r = await createModerator({ email: email.trim(), password, role });
    setBusy(false);
    if (r.ok) {
      onCreated(r.data);
      setEmail("");
      setPassword("");
      setRole("MODERATOR");
      return;
    }
    reportFailure(r);
    if (r.code === "EMAIL_TAKEN") setErrors({ email: r.message });
    else setErrors({ form: r.message });
  };

  return (
    <section className={styles.create} aria-labelledby="mods-create">
      <h2 id="mods-create" className={mod.subheading}>
        Add a moderator
      </h2>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <UnderlineInput
          className={styles.field}
          label="Email"
          type="email"
          required
          autoComplete="off"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((x) => ({ ...x, email: undefined }));
          }}
          error={errors.email}
        />
        <UnderlineInput
          className={styles.field}
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          hint={`At least ${PASSWORD_MIN} characters. Share it with them privately.`}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((x) => ({ ...x, password: undefined }));
          }}
          error={errors.password}
        />
        <UnderlineSelect
          className={styles.field}
          label="Role"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(e) => setRole(e.target.value as ModeratorRole)}
        />
        <div className={styles.submit}>
          <SubmitButton loading={busy} loadingLabel="Adding…">
            Add moderator
          </SubmitButton>
        </div>
        {errors.form && (
          <p className={`${mod.alert} ${styles.formError}`} role="alert">
            {errors.form}
          </p>
        )}
      </form>
    </section>
  );
}

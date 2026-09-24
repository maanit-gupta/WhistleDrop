"use client";

import type { ReportCategory, ReportStatus } from "@prisma/client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { StatusTag } from "@/components/ui/StatusTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { listReports, type ApiFailure, type ReportListItem, type ReportsQuery } from "@/lib/client/api";
import { CATEGORY_LABELS, formatShortDate } from "@/lib/client/labels";
import { ROUTES } from "@/lib/site";
import { useModSession } from "./ModShell";
import mod from "./mod.module.css";
import styles from "./dashboard.module.css";

// Every number here comes from GET /api/mod/reports: one request per status
// and per category with pageSize=1, reading `total`. There is no stats endpoint.

const STATUS_CARDS: { status: ReportStatus; title: string; description: string; accent?: boolean }[] = [
  { status: "SUBMITTED", title: "Awaiting Review", description: "New, not picked up yet.", accent: true },
  { status: "UNDER_REVIEW", title: "Under Review", description: "Being looked into." },
  { status: "RESOLVED", title: "Resolved", description: "Acted on; ready to close." },
  { status: "DISMISSED", title: "Dismissed", description: "No action; ready to close." },
  { status: "CLOSED", title: "Closed", description: "Read-only, evidence deleted." },
];

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ReportCategory[];

interface Stats {
  byStatus: Record<ReportStatus, number>;
  byCategory: Record<ReportCategory, number>;
  recent: ReportListItem[];
}

type View = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "ready"; stats: Stats };

const columns: DataColumn<ReportListItem>[] = [
  { key: "code", header: "Case code", cell: (r) => <span className="tabular">{r.caseCode}</span> },
  { key: "category", header: "Category", cell: (r) => CATEGORY_LABELS[r.category] },
  { key: "status", header: "Status", cell: (r) => <StatusTag status={r.status} /> },
  { key: "created", header: "Created", cell: (r) => formatShortDate(r.createdAt), align: "end" },
];

/** All the dashboard's numbers, fetched in parallel. Rejects with the first ApiFailure. */
async function fetchStats(signal: AbortSignal): Promise<Stats> {
  const count = async (query: ReportsQuery) => {
    const result = await listReports({ ...query, pageSize: 1 }, { signal });
    if (!result.ok) throw result;
    return result.data.total;
  };
  const [statusTotals, categoryTotals, recent] = await Promise.all([
    Promise.all(STATUS_CARDS.map((c) => count({ status: [c.status] }))),
    Promise.all(CATEGORIES.map((c) => count({ category: [c] }))),
    listReports({ sort: "createdAt", order: "desc", pageSize: 10 }, { signal }).then((r) => {
      if (!r.ok) throw r;
      return r.data.items;
    }),
  ]);
  return {
    byStatus: Object.fromEntries(STATUS_CARDS.map((c, i) => [c.status, statusTotals[i]])) as Stats["byStatus"],
    byCategory: Object.fromEntries(CATEGORIES.map((c, i) => [c, categoryTotals[i]])) as Stats["byCategory"],
    recent,
  };
}

export function Dashboard() {
  const { reportFailure } = useModSession();
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(
    (signal: AbortSignal) =>
      void fetchStats(signal).then(
        (stats) => {
          if (!signal.aborted) setView({ kind: "ready", stats });
        },
        (failure: ApiFailure) => {
          if (signal.aborted) return;
          reportFailure(failure);
          setView({ kind: "failed", message: failure.message });
        },
      ),
    [reportFailure],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const retry = () => {
    setView({ kind: "loading" });
    load(new AbortController().signal);
  };

  return (
    <main id="main" className={`surface-dark container ${mod.page}`}>
      <header className={mod.head}>
        <EyebrowTag>Overview</EyebrowTag>
        <h1 className="t-h2">Case Dashboard</h1>
      </header>

      {view.kind === "loading" && <HairlineShimmer rows={5} label="Loading the dashboard" />}
      {view.kind === "failed" && (
        <ErrorState
          message={view.message}
          action={
            <button type="button" className="link-u t-nav" onClick={retry}>
              Try again
            </button>
          }
        />
      )}
      {view.kind === "ready" && <DashboardBody stats={view.stats} />}
    </main>
  );
}

function DashboardBody({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...CATEGORIES.map((c) => stats.byCategory[c]));
  return (
    <>
      <section aria-labelledby="dash-status">
        <h2 id="dash-status" className="visually-hidden">
          Reports by status
        </h2>
        <ul className={styles.cards} role="list">
          {STATUS_CARDS.map((card) => (
            <li key={card.status}>
              <ServiceCard
                className={styles.card}
                title={card.title}
                description={card.description}
                numeral={<span className="tabular">{stats.byStatus[card.status].toLocaleString()}</span>}
                accent={card.accent}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.lower}>
        <section aria-labelledby="dash-category" className={styles.categories}>
          <h2 id="dash-category" className={mod.subheading}>
            By Category
          </h2>
          <ul className={styles.bars} role="list">
            {CATEGORIES.map((category) => {
              const n = stats.byCategory[category];
              return (
                <li key={category} className={styles.barRow}>
                  <span className={styles.barLabel}>{CATEGORY_LABELS[category]}</span>
                  <span className={`tabular ${styles.barCount}`}>{n.toLocaleString()}</span>
                  <span className={styles.barTrack} aria-hidden="true">
                    <span className={styles.barFill} style={{ "--w": n / max } as React.CSSProperties} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="dash-recent" className={styles.recent}>
          <div className={styles.recentHead}>
            <h2 id="dash-recent" className={mod.subheading}>
              Recent Reports
            </h2>
            <Link href={ROUTES.modReports} className="link-u t-nav">
              All reports <span aria-hidden="true">→</span>
            </Link>
          </div>
          {stats.recent.length === 0 ? (
            <EmptyState title="No reports yet" description="New reports will appear here as they arrive." />
          ) : (
            <DataTable
              caption="The 10 newest reports"
              columns={columns}
              rows={stats.recent}
              rowKey={(r) => r.id}
              rowHref={(r) => ROUTES.modReport(r.id)}
              rowLinkLabel={(r) => `Open report ${r.caseCode}`}
            />
          )}
        </section>
      </div>
    </>
  );
}

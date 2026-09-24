"use client";

import type { ReportCategory, ReportStatus } from "@prisma/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { Pagination } from "@/components/ui/Pagination";
import { StatusTag } from "@/components/ui/StatusTag";
import {
  UnderlineCheckbox,
  UnderlineDate,
  UnderlineInput,
  UnderlineMultiSelect,
  UnderlineSelect,
} from "@/components/ui/UnderlineField";
import { listReports, type ReportListItem, type ReportPage, type ReportsQuery } from "@/lib/client/api";
import { CATEGORY_LABELS, STATUS_LABELS, formatShortDate } from "@/lib/client/labels";
import { REPORT_STATUSES } from "@/lib/transitions.shared";
import { ROUTES } from "@/lib/site";
import { useModSession } from "../ModShell";
import mod from "../mod.module.css";
import styles from "./reports.module.css";

// Filters live in the page's query string (status, category, from, to, sort,
// order, awaitingReply, page), so a view survives a refresh and can be shared between
// moderators. The one exception is the search text: it can be a case code,
// and case codes never go into a URL. It stays in memory (this module), so
// it survives moving to a report and back, but not a reload.

const PAGE_SIZE = 20;
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ReportCategory[];
const SORTS = ["createdAt", "updatedAt", "status"] as const;
const ORDERS = ["desc", "asc"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Sort = (typeof SORTS)[number];
type Order = (typeof ORDERS)[number];

interface Filters {
  status: ReportStatus[];
  category: ReportCategory[];
  from: string;
  to: string;
  sort: Sort;
  order: Order;
  /** Only cases whose latest message is the reporter's. */
  awaitingReply: boolean;
  page: number;
}

const STATUS_OPTIONS = REPORT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));
const SORT_OPTIONS = [
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
  { value: "status", label: "Status" },
];
const ORDER_OPTIONS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" },
];

let rememberedSearch = "";

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const values = raw.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));
  return [...new Set(values)];
}

function parseFilters(params: URLSearchParams): Filters {
  const pick = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
    raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const page = Number(params.get("page"));
  const date = (raw: string | null) => (raw && DATE.test(raw) ? raw : "");
  return {
    status: parseList(params.get("status"), REPORT_STATUSES),
    category: parseList(params.get("category"), CATEGORIES),
    from: date(params.get("from")),
    to: date(params.get("to")),
    sort: pick(params.get("sort"), SORTS, "createdAt"),
    order: pick(params.get("order"), ORDERS, "desc"),
    awaitingReply: params.get("awaitingReply") === "true",
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

function toQueryString(f: Filters): string {
  const params = new URLSearchParams();
  if (f.status.length) params.set("status", f.status.join(","));
  if (f.category.length) params.set("category", f.category.join(","));
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.sort !== "createdAt") params.set("sort", f.sort);
  if (f.order !== "desc") params.set("order", f.order);
  if (f.awaitingReply) params.set("awaitingReply", "true");
  if (f.page > 1) params.set("page", String(f.page));
  return params.toString();
}

const columns: DataColumn<ReportListItem>[] = [
  {
    key: "code",
    header: "Case code",
    cell: (r) => (
      <span className={styles.code}>
        <span className="tabular">{r.caseCode}</span>
        {r.awaitingReply && (
          <EyebrowTag className={styles.replyTag}>
            Reply<span className="visually-hidden"> needed: the reporter wrote last</span>
          </EyebrowTag>
        )}
      </span>
    ),
    width: "24%",
  },
  { key: "category", header: "Category", cell: (r) => CATEGORY_LABELS[r.category] },
  { key: "status", header: "Status", cell: (r) => <StatusTag status={r.status} /> },
  { key: "created", header: "Created", cell: (r) => formatShortDate(r.createdAt) },
  { key: "updated", header: "Updated", cell: (r) => formatShortDate(r.updatedAt), align: "end" },
];

type Result = { key: string } & ({ kind: "ok"; page: ReportPage } | { kind: "failed"; message: string });

export function ReportsList() {
  const { reportFailure } = useModSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [search, setSearch] = useState(rememberedSearch);
  const [appliedSearch, setAppliedSearch] = useState(rememberedSearch.trim());
  const [result, setResult] = useState<Result | null>(null);

  const dateError = filters.from && filters.to && filters.from > filters.to ? "Must be on or after the From date." : undefined;

  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, page: 1, ...patch };
    const qs = toQueryString(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Typing settles for 300 ms before it searches; the page goes back to 1.
  useEffect(() => {
    rememberedSearch = search;
    const trimmed = search.trim();
    if (trimmed === appliedSearch) return;
    const timer = setTimeout(() => {
      setAppliedSearch(trimmed);
      if (filters.page !== 1) update({ page: 1 });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the text drives this
  }, [search]);

  const query: ReportsQuery = useMemo(
    () => ({
      q: appliedSearch || undefined,
      status: filters.status,
      category: filters.category,
      from: filters.from || undefined,
      to: filters.to || undefined,
      sort: filters.sort,
      order: filters.order,
      awaitingReply: filters.awaitingReply || undefined,
      page: filters.page,
      pageSize: PAGE_SIZE,
    }),
    [filters, appliedSearch],
  );
  const queryKey = JSON.stringify(query);
  // Loading = the result on screen is for a different query than the current one.
  const loading = !dateError && result?.key !== queryKey;

  useEffect(() => {
    if (dateError) return;
    const controller = new AbortController();
    void listReports(query, { signal: controller.signal }).then((r) => {
      if (controller.signal.aborted) return;
      if (r.ok) {
        setResult({ key: queryKey, kind: "ok", page: r.data });
      } else {
        reportFailure(r);
        const message = r.status === 400 ? `The filters weren't accepted: ${r.message}` : r.message;
        setResult({ key: queryKey, kind: "failed", message });
      }
    });
    return () => controller.abort();
  }, [query, queryKey, dateError, reportFailure]);

  const hasFilters =
    search.trim() !== "" ||
    filters.status.length > 0 ||
    filters.category.length > 0 ||
    filters.from !== "" ||
    filters.to !== "" ||
    filters.sort !== "createdAt" ||
    filters.order !== "desc" ||
    filters.awaitingReply;

  const clearFilters = () => {
    setSearch("");
    setAppliedSearch("");
    router.replace(pathname, { scroll: false });
  };

  const page = result?.kind === "ok" ? result.page : null;

  return (
    <main id="main" className={`surface-dark container ${mod.page}`}>
      <header className={mod.head}>
        <EyebrowTag>All cases</EyebrowTag>
        <h1 className="t-h2">Reports</h1>
      </header>

      <form className={styles.filters} role="search" aria-label="Filter reports" onSubmit={(e) => e.preventDefault()}>
        <UnderlineInput
          className={styles.search}
          label="Search"
          type="search"
          placeholder="Description or case code"
          hint="Kept on this page only: searches are never added to the address bar."
          value={search}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setSearch(e.target.value)}
        />
        <UnderlineDate
          className={styles.date}
          label="From"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => update({ from: e.target.value })}
        />
        <UnderlineDate
          className={styles.date}
          label="To"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => update({ to: e.target.value })}
          error={dateError}
        />
        <UnderlineMultiSelect
          className={styles.half}
          label="Status"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(status) => update({ status })}
        />
        <UnderlineMultiSelect
          className={styles.half}
          label="Category"
          options={CATEGORY_OPTIONS}
          value={filters.category}
          onChange={(category) => update({ category })}
        />
        <UnderlineSelect
          className={styles.sort}
          label="Sort by"
          options={SORT_OPTIONS}
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value as Sort })}
        />
        <UnderlineSelect
          className={styles.sort}
          label="Order"
          options={ORDER_OPTIONS}
          value={filters.order}
          onChange={(e) => update({ order: e.target.value as Order })}
        />
        <UnderlineCheckbox
          className={styles.awaiting}
          label="Awaiting reply"
          hint="The reporter wrote last."
          checked={filters.awaitingReply}
          onChange={(e) => update({ awaitingReply: e.target.checked })}
        />
        <div className={styles.clear}>
          <button type="button" className="link-u t-nav" onClick={clearFilters} disabled={!hasFilters}>
            Clear filters
          </button>
        </div>
      </form>

      <section className={styles.results} aria-label="Results" aria-busy={loading}>
        {!result && <HairlineShimmer rows={6} label="Loading reports" />}
        {result?.kind === "failed" && <ErrorState message={result.message} />}
        {page && page.items.length === 0 && (
          <EmptyState
            title="No reports match"
            description={hasFilters ? "Try fewer filters or a different search." : "There are no reports yet."}
            action={
              hasFilters && (
                <button type="button" className="link-u t-nav" onClick={clearFilters}>
                  Clear filters
                </button>
              )
            }
          />
        )}
        {page && page.items.length > 0 && (
          <div className={loading ? styles.stale : undefined}>
            <DataTable
              caption="Reports"
              columns={columns}
              rows={page.items}
              rowKey={(r) => r.id}
              rowHref={(r) => ROUTES.modReport(r.id)}
              rowLinkLabel={(r) => `Open report ${r.caseCode}`}
            />
          </div>
        )}
        {page && (
          <Pagination
            className={styles.pagination}
            page={page.page}
            pageSize={page.pageSize}
            total={page.total}
            busy={loading}
            onPageChange={(p) => {
              update({ page: p });
              window.scrollTo({ top: 0 });
            }}
          />
        )}
      </section>
    </main>
  );
}

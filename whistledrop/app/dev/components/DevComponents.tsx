"use client";

import { useState } from "react";
import { NavPill } from "@/components/ui/NavPill";
import { PillCTA } from "@/components/ui/PillCTA";
import { BlockCTA } from "@/components/ui/BlockCTA";
import { OutlineOnLimeCTA } from "@/components/ui/OutlineOnLimeCTA";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { NumberedFeatureRow } from "@/components/ui/NumberedFeatureRow";
import { SlideTilePair } from "@/components/ui/SlideTile";
import {
  UnderlineDate,
  UnderlineInput,
  UnderlineMultiSelect,
  UnderlineSelect,
  UnderlineTextarea,
} from "@/components/ui/UnderlineField";
import { FileDropzone, type DropzoneFile } from "@/components/ui/FileDropzone";
import { InfoCard } from "@/components/ui/InfoCard";
import { StatusTimeline } from "@/components/ui/StatusTimeline";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { LeaveSiteModal } from "@/components/ui/LeaveSiteModal";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { RevealHeadline, FadeUp } from "@/components/ui/Reveal";
import { HairlineDraw } from "@/components/ui/HairlineDraw";
import { StickyStack } from "@/components/ui/StickyStack";
import { PleatedFan } from "@/components/visuals/PleatedFan";
import { DiagonalRibbons } from "@/components/visuals/DiagonalRibbons";
import { AbstractTile } from "@/components/visuals/AbstractTile";
import { LimeBars } from "@/components/visuals/LimeBars";
import { Monogram } from "@/components/visuals/Monogram";
import { nextStatuses, REPORT_STATUSES } from "@/lib/transitions.shared";
import styles from "./dev.module.css";

// Sample data only. Nothing here calls the API.

const CATEGORIES = [
  { value: "SECURITY", label: "Security" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "CORRUPTION", label: "Corruption" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "OTHER", label: "Other" },
] as const;

type Row = { id: string; ref: string; category: string; status: string; created: string };
const ROWS: Row[] = [
  { id: "c1", ref: "Sample row A", category: "Security", status: "Submitted", created: "12 Sep 2026" },
  { id: "c2", ref: "Sample row B", category: "Harassment", status: "Under review", created: "10 Sep 2026" },
  { id: "c3", ref: "Sample row C", category: "Other", status: "Resolved", created: "2 Sep 2026" },
];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function Section({ title, children, surface = "dark" }: { title: string; children: React.ReactNode; surface?: string }) {
  return (
    <section className={`${styles.block} surface-${surface}`}>
      <div className="container">
        <p className={`t-eyebrow t-secondary ${styles.blockTitle}`}>{title}</p>
        {children}
      </div>
    </section>
  );
}

export function DevComponents() {
  const [variant, setVariant] = useState<"public" | "moderator">("public");
  const [admin, setAdmin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [leaveUrl, setLeaveUrl] = useState<string | null>(null);
  const [cats, setCats] = useState<string[]>(["SECURITY"]);
  const [description, setDescription] = useState("");
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<DropzoneFile[]>([]);
  const [rejects, setRejects] = useState<string[]>([]);

  const addFiles = (added: File[]) => {
    const next = added.map((f) => ({
      id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      sizeBytes: f.size,
      progress: 0,
      status: "uploading" as const,
    }));
    setFiles((prev) => [...prev, ...next]);
    // Fake progress for the visual check.
    for (const file of next) {
      let p = 0;
      const timer = setInterval(() => {
        p = Math.min(1, p + 0.15);
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, progress: p, status: p >= 1 ? "done" : "uploading" } : f)),
        );
        if (p >= 1) clearInterval(timer);
      }, 250);
    }
  };

  return (
    <>
      {variant === "public" ? (
        <NavPill />
      ) : (
        <NavPill variant="moderator" showAdminLink={admin} onSignOut={() => setVariant("public")} />
      )}

      <main id="main">
        <section className={`${styles.hero} surface-dark`}>
          <div className="container">
            <EyebrowTag>Dev · component check</EyebrowTag>
            <RevealHeadline as="h1" className={`t-h1 ${styles.heroTitle}`} lines={["Speak up.", "Stay unseen."]} />
            <FadeUp delay={300}>
              <p className="t-body-lg t-secondary measure">
                Temporary page (deleted in Part 3). Scroll down: the nav fades to 40% past this hero and returns
                on scroll-up, hover or focus.
              </p>
            </FadeUp>
            <div className={styles.row}>
              <button type="button" className="link-u t-nav" onClick={() => setVariant(variant === "public" ? "moderator" : "public")}>
                Toggle nav variant ({variant})
              </button>
              {variant === "moderator" && (
                <button type="button" className="link-u t-nav" onClick={() => setAdmin(!admin)}>
                  Toggle ADMIN link ({admin ? "on" : "off"})
                </button>
              )}
            </div>
          </div>
        </section>

        <Section title="Typography">
          <div className="stack">
            <p className="t-h1">H1 display</p>
            <p className="t-h2">H2 section heading</p>
            <p className="t-h3">H3 card title</p>
            <p className="t-numeral">01 234</p>
            <p className="t-nav">Nav label 15px</p>
            <p className="t-eyebrow t-secondary">Eyebrow · 11px uppercase</p>
            <p className="t-body measure">
              Body copy in Inter Tight 400 at 16px with 1.45 line height, held to about 42 characters per line on
              dark sections. <a href="#main" className="link-u">A link with a hover underline.</a>
            </p>
          </div>
        </Section>

        <Section title="Grid (12 columns, 24px gutters)">
          <div className="grid">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className={`col-1 ${styles.gridCell}`}>{i + 1}</div>
            ))}
            <div className={`col-8 ${styles.gridCell}`}>col-8</div>
            <div className={`col-4 ${styles.gridCell}`}>col-4</div>
          </div>
        </Section>

        <Section title="Buttons">
          <div className={styles.row}>
            <PillCTA href="/dev/components">Submit a Report</PillCTA>
            <PillCTA onClick={() => undefined} size="sm">Small pill</PillCTA>
          </div>
          <div className={styles.narrow}>
            <BlockCTA onClick={() => undefined}>Track an existing report</BlockCTA>
            <SubmitButton loading={loading} loadingLabel="Sending…" onClick={() => setLoading(true)}>
              Send report
            </SubmitButton>
            <button type="button" className="link-u t-nav" onClick={() => setLoading(false)}>
              Reset loading
            </button>
            <SubmitButton disabled>Disabled submit</SubmitButton>
          </div>
        </Section>

        <section className={`${styles.block} surface-lime`}>
          <div className="container">
            <p className={`t-eyebrow ${styles.blockTitle}`}>Report band (flat lime) · OutlineOnLimeCTA · EyebrowTag on light</p>
            <div className={styles.row}>
              <OutlineOnLimeCTA href="/dev/components">Start a report</OutlineOnLimeCTA>
              <EyebrowTag>No account needed</EyebrowTag>
            </div>
            <div className={styles.narrow}>
              <BlockCTA onClick={() => undefined}>Block CTA on lime</BlockCTA>
            </div>
          </div>
        </section>

        <Section title="Eyebrow tags · ServiceCards">
          <div className={styles.row}>
            <EyebrowTag>Anonymous</EyebrowTag>
            <EyebrowTag>No tracking</EyebrowTag>
          </div>
          <div className="grid">
            <ServiceCard className="col-4" title="Report" description="Describe what happened. No name, no email, no account." />
            <ServiceCard className="col-4" title="Track" numeral="02" description="Check progress with the case code only you hold. Nothing else identifies you." />
            <ServiceCard className="col-4" title="Close" numeral="03" accent description="When a case closes, its evidence files are deleted for good." />
          </div>
        </Section>

        <Section title="NumberedFeatureRow · HairlineDraw">
          <NumberedFeatureRow number="01" title={<>Nothing that<br />identifies you</>} description="No IP addresses, cookies or device details are stored with a report. Rate limiting uses a daily-rotating hash that is never written to the database." />
          <NumberedFeatureRow number="02" title={<>Evidence,<br />cleaned</>} description="Images are re-encoded to strip location and camera metadata before they're stored.">
            <PillCTA size="sm" onClick={() => undefined}>Interactive slot</PillCTA>
          </NumberedFeatureRow>
          <div className={styles.spacer} />
          <HairlineDraw>
            <p className="t-body measure">The hairline draws left to right over 900ms, then this content fades up.</p>
          </HairlineDraw>
        </Section>

        <Section title="SlideTile pair">
          <div className={styles.slidePad}>
            <SlideTilePair
              label="How WhistleDrop protects you"
              slides={[
                { statement: "Your report gets a case code. It's the only link between you and your report.", label: "Case codes", subLabel: "Keep it somewhere safe", bars: [0.2, 0.35, 0.3, 0.5, 0.45, 0.62, 0.58, 0.75, 0.7, 0.9] },
                { statement: "Moderators see what you wrote, never who you are.", label: "Moderation", subLabel: "Role-checked on every request", bars: [0.5, 0.4, 0.62, 0.3, 0.7, 0.55, 0.8, 0.45, 0.66, 0.5] },
                { statement: "Closing a case deletes its evidence files permanently.", label: "Retention", subLabel: "Nothing kept longer than needed", bars: [0.9, 0.78, 0.7, 0.6, 0.52, 0.44, 0.35, 0.28, 0.2, 0.12] },
              ]}
            />
          </div>
        </Section>

        <Section title="Fields">
          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <UnderlineSelect label="Category" required placeholder="Choose a category" options={CATEGORIES} defaultValue="" />
            <UnderlineTextarea
              label="What happened?"
              required
              hint="Don't include your name or anything that identifies you."
              maxChars={5000}
              minChars={20}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={description.length > 0 && description.length < 20 ? "Please write at least 20 characters." : undefined}
            />
            <UnderlineInput label="Evidence link" type="url" hint="Optional. http(s) only." placeholder="https://" />
            <UnderlineInput label="With an error" defaultValue="not-an-email" error="Enter a valid email address." />
            <UnderlineMultiSelect label="Categories" options={CATEGORIES} value={cats} onChange={setCats} />
            <UnderlineDate label="From" />
            <FileDropzone
              label="Evidence files"
              hint="Up to 3 files · JPEG, PNG, WebP or PDF · 10 MB each"
              files={files}
              onAdd={addFiles}
              onRemove={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))}
              onReject={setRejects}
              error={rejects.length ? rejects.join(" · ") : undefined}
              accept={ALLOWED_TYPES}
              maxFiles={3}
              maxBytes={10 * 1024 * 1024}
            />
            <SubmitButton>Submit (no-op)</SubmitButton>
          </form>
        </Section>

        <Section title="InfoCard · StatusTimeline">
          <div className="grid">
            <div className="col-5">
              <InfoCard
                title="Report"
                items={[
                  { label: "Category", value: "Security" },
                  { label: "Status", value: "Under review" },
                  { label: "Submitted", value: "12 September 2026" },
                ]}
              />
            </div>
            <div className="col-7">
              <StatusTimeline
                entries={[
                  { key: "1", status: "Submitted", date: "2026-09-12T09:30:00Z" },
                  { key: "2", status: "Under review", note: "Thanks, we're looking into this.", date: "2026-09-13T14:10:00Z", visibility: "PUBLIC", author: "moderator@example.com" },
                  { key: "3", status: "Under review", note: "Internal: checked access logs.", date: "2026-09-14T08:00:00Z", visibility: "INTERNAL", author: "admin@example.com" },
                ]}
              />
            </div>
          </div>
          <p className={`t-body-sm t-secondary ${styles.note}`}>
            Shared transitions: {REPORT_STATUSES.map((s) => `${s} → ${nextStatuses(s).join(" | ") || "(terminal)"}`).join(";  ")}
          </p>
        </Section>

        <Section title="DataTable · Pagination">
          <DataTable
            caption="Sample reports"
            columns={[
              { key: "ref", header: "Report", cell: (r: Row) => r.ref },
              { key: "category", header: "Category", cell: (r: Row) => r.category },
              { key: "status", header: "Status", cell: (r: Row) => r.status },
              { key: "created", header: "Created", cell: (r: Row) => r.created, align: "end" },
            ]}
            rows={ROWS}
            rowKey={(r) => r.id}
            rowHref={() => "/dev/components"}
          />
          <Pagination page={page} pageSize={20} total={47} onPageChange={setPage} />
        </Section>

        <Section title="Modal · LeaveSiteModal · states">
          <div className={styles.row}>
            <PillCTA onClick={() => setModalOpen(true)}>Open modal</PillCTA>
            <button type="button" className="link-u t-nav" onClick={() => setLeaveUrl("https://example.org/some/very/long/path?with=query&and=more")}>
              External link (LeaveSiteModal)
            </button>
            <button type="button" className="link-u t-nav" onClick={() => setLeaveUrl("javascript:alert(1)")}>
              Unsafe link
            </button>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Close this report?"
            description="Closing permanently deletes every evidence file. This can't be undone."
            footer={
              <>
                <PillCTA onClick={() => setModalOpen(false)} data-autofocus>Close report</PillCTA>
                <button type="button" className="link-u t-nav" onClick={() => setModalOpen(false)}>Cancel</button>
              </>
            }
          />
          <LeaveSiteModal url={leaveUrl} onClose={() => setLeaveUrl(null)} />
          <div className="grid">
            <div className="col-4"><HairlineShimmer rows={4} /></div>
            <div className="col-4"><EmptyState title="No reports match" description="Try removing a filter." /></div>
            <div className="col-4"><ErrorState message="Too many attempts. Try again in 5 minutes." /></div>
          </div>
        </Section>

        <Section title="StickyStack (normal flow below 768px)">
          <StickyStack top={120}>
            {["Write", "Submit", "Track"].map((t, i) => (
              <ServiceCard key={t} title={t} numeral={`0${i + 1}`} description="Each card slides over the previous one, leaving a 16px peek." />
            ))}
          </StickyStack>
          <div className={styles.spacer} />
        </Section>

        <Section title="Visuals">
          <div className="grid">
            <div className={`col-6 ${styles.visual}`}><PleatedFan parallax="hero" /></div>
            <div className={`col-6 ${styles.visual}`}><DiagonalRibbons parallax="soft" /></div>
            {([0, 1, 2] as const).map((v) => (
              <div key={v} className={`col-4 ${styles.visualSm}`}>
                <AbstractTile variant={v} />
                <LimeBars playKey={v} />
              </div>
            ))}
          </div>
          <div className={styles.row}>
            <Monogram size={24} />
            <Monogram size={40} />
            <Monogram size={96} title="WhistleDrop" />
          </div>
        </Section>

        <section className={`${styles.block} surface-light`}>
          <div className="container">
            <p className={`t-eyebrow ${styles.blockTitle}`}>Light surface: secondary text uses --text-dark</p>
            <p className="t-h2">Paper section</p>
            <p className="t-body t-secondary measure">Muted grey would be 2.8:1 here, so secondary text stays ink.</p>
          </div>
        </section>
      </main>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BlockCTA } from "@/components/ui/BlockCTA";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { RevealHeadline } from "@/components/ui/Reveal";
import { UnderlineCheckbox } from "@/components/ui/UnderlineField";
import { useCaseCodeHandoff } from "@/lib/client/caseCodeHandoff";
import { ROUTES } from "@/lib/site";
import styles from "./report.module.css";

// PRIVACY: the code is shown, copied to the clipboard or saved as a file only
// when the reporter asks. It is never written to storage, cookies, the URL or
// the console. The download's file name doesn't contain it either, so it
// doesn't show up in the browser's download list.

const FILE_NAME = "whistledrop-case-code.txt";

function fileText(code: string) {
  return [
    `WhistleDrop case code: ${code}`,
    "",
    `Follow your report at ${window.location.origin}${ROUTES.track}`,
    "This code is the only way to follow your report. It cannot be recovered.",
    "Keep it private: anyone who has it can read your report.",
    "",
  ].join("\n");
}

export function CaseCodeScreen({ code, onDone }: { code: string; onDone: () => void }) {
  const router = useRouter();
  const handoff = useCaseCodeHandoff();
  const [saved, setSaved] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  // Move focus to the new heading so keyboard and screen reader users land here.
  useEffect(() => {
    document.getElementById("report-form-title")?.focus({ preventScroll: true });
  }, []);

  // Closing the tab or reloading before saving the code would lose it for good.
  useEffect(() => {
    if (saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([fileText(code)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = FILE_NAME;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const done = () => {
    onDone();
    router.push(ROUTES.home);
  };

  const track = () => {
    handoff.leave(code);
    onDone();
    router.push(ROUTES.track);
  };

  return (
    <div className={styles.codeScreen}>
      <EyebrowTag className={styles.eyebrow}>Report received</EyebrowTag>
      <RevealHeadline id="report-form-title" tabIndex={-1} className={`t-h2 ${styles.codeTitle}`} lines={["Your Case Code"]} />

      <p className={`t-h1 tabular ${styles.code}`}>{code}</p>

      <p className={styles.warning}>This code is the only way to follow your report. It cannot be recovered.</p>

      <div className={styles.codeActions}>
        <BlockCTA onClick={copy}>{copyStatus === "copied" ? "Copied" : "Copy"}</BlockCTA>
        <BlockCTA onClick={download}>Download .txt</BlockCTA>
      </div>
      <p className={styles.copyStatus} aria-live="polite">
        {copyStatus === "copied" && "Copied to the clipboard. Clear it once you've stored the code."}
        {copyStatus === "failed" && "Couldn't copy automatically. Select the code and copy it, or download it."}
      </p>

      <UnderlineCheckbox
        label="I have saved my case code"
        required
        checked={saved}
        onChange={(e) => setSaved(e.target.checked)}
        hint={saved ? undefined : "Done and Track this case unlock once you tick this."}
      />

      <div className={styles.codeActions}>
        <BlockCTA onClick={track} disabled={!saved}>
          Track this case
        </BlockCTA>
        <BlockCTA onClick={done} disabled={!saved}>
          Done
        </BlockCTA>
      </div>
    </div>
  );
}

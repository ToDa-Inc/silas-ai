"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar } from "lucide-react";
import {
  clientApiHeaders,
  contentApiFetch,
  formatFastApiError,
  getContentApiBase,
} from "@/lib/api-client";
import { INTELLIGENCE_TOOLBAR_ICON_CLASS } from "./intelligence-toolbar-styles";

type Props = {
  clientSlug: string;
  orgSlug: string;
  disabled?: boolean;
  disabledHint?: string | null;
  onMessage?: (message: string, tone: "neutral" | "success" | "error") => void;
};

type JobRow = {
  status?: string;
  error_message?: string | null;
  result?: { reels_upserted?: number; phase?: string; enriched_count?: number };
};

const POLL_MS = 4000;
const MAX_POLLS = 180;

/** Queue niche keyword reel scrape (parallel to competitors); worker fills scraped_reels. */
export function NicheReelScrapeButton({
  clientSlug,
  orgSlug,
  disabled,
  disabledHint,
  onMessage,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const title =
    disabledHint?.trim() ||
    "Find recent Instagram reels that match this creator’s niche. This can take several minutes.";

  async function run() {
    if (disabled || !clientSlug.trim() || !orgSlug.trim()) {
      onMessage?.(
        disabledHint?.trim() ||
          (!orgSlug.trim()
            ? "No organization context — refresh the page."
            : "Select a creator in the header first."),
        "error",
      );
      return;
    }
    setBusy(true);
    onMessage?.("Starting niche search…", "neutral");
    try {
      const apiBase = getContentApiBase();
      const headers = await clientApiHeaders({ orgSlug });
      const postRes = await contentApiFetch(
        `${apiBase}/api/v1/clients/${encodeURIComponent(clientSlug)}/niche-reels/scrape`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const postJson = (await postRes.json().catch(() => ({}))) as {
        job_id?: string;
        detail?: unknown;
      };

      if (postRes.status === 409) {
        onMessage?.("A niche search is already running — try again when it finishes.", "error");
        setBusy(false);
        return;
      }
      if (postRes.status === 503) {
        onMessage?.("Niche search isn’t available right now — contact support if it keeps happening.", "error");
        setBusy(false);
        return;
      }
      if (!postRes.ok) {
        onMessage?.(formatFastApiError(postJson as Record<string, unknown>, "Request failed"), "error");
        setBusy(false);
        return;
      }

      const jobId = postJson.job_id;
      if (!jobId) {
        onMessage?.("Couldn’t start the search. Try again.", "error");
        setBusy(false);
        return;
      }

      onMessage?.("Searching your keywords and saving matching reels…", "neutral");

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const jRes = await contentApiFetch(`${apiBase}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
          headers,
        });
        const job = (await jRes.json().catch(() => ({}))) as JobRow;

        if (!jRes.ok) {
          onMessage?.(
            formatFastApiError(job as unknown as Record<string, unknown>, "Couldn’t check progress"),
            "error",
          );
          setBusy(false);
          return;
        }

        if (job.status === "failed") {
          onMessage?.(job.error_message || "Niche search didn’t finish.", "error");
          setBusy(false);
          return;
        }

        if (job.status === "completed") {
          const n = job.result?.reels_upserted;
          onMessage?.(
            typeof n === "number"
              ? `Found and saved ${n} reel(s). Refreshing…`
              : "Search finished. Refreshing…",
            "success",
          );
          router.refresh();
          setBusy(false);
          return;
        }
      }

      onMessage?.(
        "Still searching. Refresh Intelligence in a few minutes to check for new reels.",
        "neutral",
      );
      setBusy(false);
    } catch {
      onMessage?.("Something went wrong — try again.", "error");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || !clientSlug.trim() || !orgSlug.trim() || busy}
      title={title}
      aria-label="Find niche reels"
      onClick={() => void run()}
      className={INTELLIGENCE_TOOLBAR_ICON_CLASS}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
      ) : (
        <Radar className="h-5 w-5 shrink-0" aria-hidden />
      )}
    </button>
  );
}

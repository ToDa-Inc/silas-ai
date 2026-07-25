"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  fetchClientRowClient,
  putClientFields,
  startNicheDiscoveryRun,
  contentApiFetch,
  clientApiHeaders,
  getContentApiBase,
} from "@/lib/api-client";
import type { ClientRow } from "@/lib/api";
import {
  AUDIENCE_GEOGRAPHY_OPTIONS,
  type AudienceGeography,
  type ContentLanguage,
  mergeAudienceGeographyIntoIcp,
  normalizeAudienceGeography,
  normalizeContentLanguage,
  patchClientContextIcpLocation,
} from "@/lib/audience-targeting";
import { cn } from "@/lib/cn";

export type TargetingControlsHandle = {
  /** Persist current targeting. Returns true when saved or already empty/invalid skip. */
  save: () => Promise<boolean>;
};

type Props = {
  clientSlug: string;
  orgSlug: string;
  initialLanguage?: string | null;
  initialIcp?: Record<string, unknown> | null;
  disabled?: boolean;
  /** Onboarding dark panel vs dashboard Context surface. */
  variant?: "onboarding" | "context";
  showRefreshRecommendations?: boolean;
  onSaved?: (row: ClientRow) => void;
  className?: string;
};

const POLL_MS = 4000;
const MAX_POLLS = 180;

export const TargetingControls = forwardRef<TargetingControlsHandle, Props>(
  function TargetingControls(
    {
      clientSlug,
      orgSlug,
      initialLanguage,
      initialIcp,
      disabled,
      variant = "context",
      showRefreshRecommendations = false,
      onSaved,
      className,
    },
    ref,
  ) {
    const [language, setLanguage] = useState<ContentLanguage>(() =>
      normalizeContentLanguage(initialLanguage),
    );
    const [geography, setGeography] = useState<AudienceGeography | "">(() =>
      normalizeAudienceGeography(initialIcp?.audience_geography),
    );
    const [geoNote, setGeoNote] = useState(
      () =>
        typeof initialIcp?.audience_geography_note === "string"
          ? initialIcp.audience_geography_note
          : "",
    );
    const [saveBusy, setSaveBusy] = useState(false);
    const [refreshBusy, setRefreshBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");

    useEffect(() => {
      setLanguage(normalizeContentLanguage(initialLanguage));
    }, [initialLanguage]);

    useEffect(() => {
      setGeography(normalizeAudienceGeography(initialIcp?.audience_geography));
      setGeoNote(
        typeof initialIcp?.audience_geography_note === "string"
          ? initialIcp.audience_geography_note
          : "",
      );
    }, [initialIcp]);

    const geoValid =
      !geography || geography !== "custom" || Boolean(geoNote.trim());
    const canSave = useMemo(() => {
      if (disabled || !clientSlug.trim() || !orgSlug.trim()) return false;
      return geoValid;
    }, [disabled, clientSlug, orgSlug, geoValid]);

    async function saveTargeting(): Promise<ClientRow | null> {
      if (!canSave) return null;
      if (geography === "custom" && !geoNote.trim()) {
        setStatusTone("error");
        setStatus("Add a custom geography note, or pick Worldwide / English-speaking / DACH.");
        return null;
      }
      setSaveBusy(true);
      setStatusTone("neutral");
      setStatus("Saving targeting…");
      try {
        const current = await fetchClientRowClient(clientSlug, orgSlug);
        if (!current.ok) {
          setStatusTone("error");
          setStatus(current.error);
          return null;
        }
        const fields: {
          language: ContentLanguage;
          icp?: Record<string, unknown>;
          client_context?: Record<string, unknown>;
        } = { language };
        if (geography) {
          fields.icp = mergeAudienceGeographyIntoIcp(current.data.icp, geography, geoNote);
          const patchedContext = patchClientContextIcpLocation(
            (current.data.client_context as Record<string, unknown> | null) ?? null,
            geography,
            geoNote,
            language,
          );
          if (patchedContext) fields.client_context = patchedContext;
        }
        const result = await putClientFields(clientSlug, orgSlug, fields);
        if (!result.ok) {
          setStatusTone("error");
          setStatus(result.error);
          return null;
        }
        setStatusTone("success");
        setStatus("Targeting saved — discovery will use these settings.");
        onSaved?.(result.data);
        return result.data;
      } finally {
        setSaveBusy(false);
      }
    }

    useImperativeHandle(
      ref,
      () => ({
        save: async () => {
          if (geography === "custom" && !geoNote.trim()) {
            setStatusTone("error");
            setStatus("Add a custom geography note, or pick Worldwide / English-speaking / DACH.");
            return false;
          }
          const row = await saveTargeting();
          return Boolean(row);
        },
      }),
      // saveTargeting closes over latest targeting fields
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [canSave, geography, geoNote, language, clientSlug, orgSlug, disabled],
    );

    async function refreshRecommendations() {
      if (disabled || !clientSlug.trim() || !orgSlug.trim()) return;
      setRefreshBusy(true);
      setStatusTone("neutral");
      setStatus("Refreshing recommendations…");
      try {
        const saved = await saveTargeting();
        if (!saved) return;
        // Force DNA/keyword recompile so discovery doesn't race the background job.
        const apiBase = getContentApiBase();
        const headers = await clientApiHeaders({ orgSlug });
        const dnaRes = await contentApiFetch(
          `${apiBase}/api/v1/clients/${encodeURIComponent(clientSlug)}/dna/regenerate`,
          { method: "POST", headers },
        );
        if (!dnaRes.ok) {
          setStatusTone("error");
          setStatus("Saved targeting, but couldn’t refresh the AI profile for discovery.");
          return;
        }
        const start = await startNicheDiscoveryRun(clientSlug, orgSlug);
        if (!start.ok) {
          setStatusTone("error");
          setStatus(
            start.status === 409
              ? "A discovery job is already running — try again when it finishes."
              : start.error,
          );
          return;
        }
        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          const jRes = await contentApiFetch(
            `${apiBase}/api/v1/jobs/${encodeURIComponent(start.jobId)}`,
            { headers },
          );
          const job = (await jRes.json().catch(() => ({}))) as {
            status?: string;
            error_message?: string | null;
          };
          if (!jRes.ok) {
            setStatusTone("error");
            setStatus("Couldn’t check discovery progress.");
            return;
          }
          if (job.status === "failed") {
            setStatusTone("error");
            setStatus(job.error_message || "Discovery didn’t finish.");
            return;
          }
          if (job.status === "completed" || job.status === "succeeded") {
            setStatusTone("success");
            setStatus("Recommendations refreshed.");
            return;
          }
        }
        setStatusTone("neutral");
        setStatus("Discovery is still running — check Intelligence shortly.");
      } finally {
        setRefreshBusy(false);
      }
    }

    const onboarding = variant === "onboarding";
    const labelClass = onboarding
      ? "text-xs font-semibold uppercase tracking-wide text-zinc-400"
      : "text-xs font-semibold uppercase tracking-wide text-zinc-500";
    const selectClass = onboarding
      ? "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white"
      : "w-full rounded-lg border border-outline-variant/20 bg-surface-container-low/90 px-3 py-2.5 text-sm text-on-surface";
    const helperClass = onboarding
      ? "mt-1 text-xs leading-relaxed text-zinc-400"
      : "mt-1 text-xs leading-relaxed text-zinc-500";

    return (
      <section
        className={cn(
          onboarding
            ? "rounded-3xl border border-sky-400/20 bg-sky-400/5 p-5"
            : "mb-8 rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.06] to-transparent p-5",
          className,
        )}
      >
        <div>
          <h2
            className={cn(
              "text-base font-semibold",
              onboarding ? "text-white" : "text-on-surface",
            )}
          >
            Check targeting
          </h2>
          <p className={helperClass}>
            Content language and audience geography steer which creators and reels Silas looks for.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Content language</span>
            <select
              className={cn(selectClass, "mt-1.5")}
              value={language}
              disabled={disabled || saveBusy || refreshBusy}
              onChange={(e) => setLanguage(normalizeContentLanguage(e.target.value))}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Audience geography</span>
            <select
              className={cn(selectClass, "mt-1.5")}
              value={geography}
              disabled={disabled || saveBusy || refreshBusy}
              onChange={(e) =>
                setGeography(normalizeAudienceGeography(e.target.value) || ("" as const))
              }
            >
              <option value="">Select…</option>
              {AUDIENCE_GEOGRAPHY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "worldwide"
                    ? "Worldwide"
                    : opt === "english_speaking"
                      ? "English-speaking markets"
                      : opt === "dach"
                        ? "DACH"
                        : "Custom"}
                </option>
              ))}
            </select>
          </label>
        </div>

        {geography === "custom" ? (
          <label className="mt-4 block">
            <span className={labelClass}>Custom geography</span>
            <input
              className={cn(selectClass, "mt-1.5")}
              value={geoNote}
              disabled={disabled || saveBusy || refreshBusy}
              placeholder="e.g. US + UK only"
              onChange={(e) => setGeoNote(e.target.value)}
            />
          </label>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSave || saveBusy || refreshBusy}
            onClick={() => void saveTargeting()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50",
              onboarding
                ? "border border-sky-300/40 bg-sky-300/15 text-sky-100"
                : "border border-sky-600/40 bg-sky-600/15 text-sky-950 dark:text-sky-100",
            )}
          >
            {saveBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {saveBusy ? "Saving…" : "Save targeting"}
          </button>
          {showRefreshRecommendations ? (
            <button
              type="button"
              disabled={disabled || saveBusy || refreshBusy || !canSave}
              onClick={() => void refreshRecommendations()}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50",
                onboarding
                  ? "border-white/15 bg-white/5 text-white"
                  : "border-outline-variant/25 bg-surface-container/80 text-app-fg-secondary",
              )}
            >
              {refreshBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              {refreshBusy ? "Refreshing…" : "Refresh recommendations"}
            </button>
          ) : null}
        </div>

        {status ? (
          <p
            className={cn(
              "mt-3 text-xs",
              statusTone === "error"
                ? "text-red-400"
                : statusTone === "success"
                  ? onboarding
                    ? "text-emerald-300"
                    : "text-emerald-700 dark:text-emerald-300"
                  : onboarding
                    ? "text-zinc-400"
                    : "text-zinc-500",
            )}
          >
            {status}
          </p>
        ) : null}
      </section>
    );
  },
);

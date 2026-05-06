"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  fetchClientRowClient,
  normalizeCtaLibraryFromRaw,
  normalizeGenerationLibrariesFromRow,
  putClientGenerationLibraries,
} from "@/lib/api-client";
import type { ClientCta, ClientCtaType, ClientRow } from "@/lib/api";
import { cn } from "@/lib/cn";
import { GenerationTemplatesPanel } from "../media/generation-templates-panel";

type Props = {
  clientSlug: string;
  orgSlug: string;
  client: ClientRow | null;
  disabled?: boolean;
};

const CTA_TYPES: { id: ClientCtaType; label: string; helper: string }[] = [
  { id: "website", label: "Website / landing page", helper: "Use for a sales page, blog post, or external link." },
  { id: "newsletter", label: "Newsletter", helper: "Use when the next step is joining an email list." },
  { id: "lead_magnet", label: "Free resource / webinar", helper: "Use for PDFs, trainings, webinars, checklists, or comment-keyword freebies." },
  { id: "booking", label: "Book a call", helper: "Use for calls, demos, applications, or consultations." },
  { id: "video", label: "Another video", helper: "Use for YouTube videos, lives, or follow-up content." },
  { id: "other", label: "Something else", helper: "Use when the next step does not fit the other options." },
];

function generateCtaId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `cta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ctaSig(ctas: ClientCta[]): string {
  return JSON.stringify(normalizeCtaLibraryFromRaw(ctas));
}

export function GenerationLibrariesPanel({ clientSlug, orgSlug, client, disabled = false }: Props) {
  const router = useRouter();
  const initialCtas = useMemo(
    () => normalizeGenerationLibrariesFromRow(client ?? {}).ctaLibrary,
    [client],
  );
  const initialSig = useMemo(() => ctaSig(initialCtas), [initialCtas]);
  const [ctaLibrary, setCtaLibrary] = useState<ClientCta[]>(initialCtas);
  const [baselineSig, setBaselineSig] = useState(() => initialSig);
  const [expandedCtaId, setExpandedCtaId] = useState<string | null>(null);
  const [openCtaTypeId, setOpenCtaTypeId] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const dirty = ctaSig(ctaLibrary) !== baselineSig;

  useEffect(() => {
    if (dirty) return;
    setCtaLibrary(initialCtas);
    setBaselineSig(initialSig);
  }, [dirty, initialCtas, initialSig]);

  function updateCtaAt(idx: number, patch: Partial<ClientCta>) {
    setStatus(null);
    setCtaLibrary((prev) => prev.map((c, j) => (j === idx ? { ...c, ...patch } : c)));
  }

  async function saveCtas() {
    const cs = clientSlug.trim();
    const os = orgSlug.trim();
    if (disabled || !cs || !os) {
      setStatus("Select a workspace and creator first.");
      return;
    }

    const unnamed = ctaLibrary.find((cta) => !cta.label.trim());
    if (unnamed) {
      setExpandedCtaId(unnamed.id);
      setStatus("Add a name before saving this next step.");
      return;
    }

    setSaveBusy(true);
    setStatus("Saving next steps...");
    try {
      const fresh = await fetchClientRowClient(cs, os);
      if (!fresh.ok) {
        setStatus(fresh.error);
        return;
      }

      const merged =
        fresh.data.generation_libraries && typeof fresh.data.generation_libraries === "object"
          ? { ...(fresh.data.generation_libraries as Record<string, unknown>) }
          : {};
      const preserved = normalizeGenerationLibrariesFromRow(fresh.data);
      if (!("carousel_templates" in merged) && preserved.carouselTemplates.length > 0) {
        merged.carousel_templates = preserved.carouselTemplates;
      }
      if (!("cover_thumbnail_templates" in merged) && preserved.coverTemplates.length > 0) {
        merged.cover_thumbnail_templates = preserved.coverTemplates;
      }

      const cleaned = normalizeCtaLibraryFromRaw(ctaLibrary);
      if (cleaned.length > 0) merged.cta_library = cleaned;
      else delete merged.cta_library;

      const putRes = await putClientGenerationLibraries(cs, os, merged);
      if (!putRes.ok) {
        setStatus(putRes.error);
        return;
      }

      const nextCtas = normalizeGenerationLibrariesFromRow(putRes.data).ctaLibrary;
      setCtaLibrary(nextCtas);
      setBaselineSig(ctaSig(nextCtas));
      setStatus("Next steps saved.");
      if (typeof window !== "undefined") {
        window.localStorage.setItem("content-defaults:updated-at", String(Date.now()));
        window.dispatchEvent(new Event("content-defaults-updated"));
      }
      router.refresh();
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div id="content-defaults" className="space-y-8 scroll-mt-6">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
        <p className="text-sm font-semibold text-on-surface">Defaults for future posts</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Add the next steps, carousel structures, and cover styles this creator uses often.
          When you generate a post, you can pick one of these defaults instead of explaining it again.
        </p>
      </div>

      <section className="rounded-2xl border border-outline-variant/15 bg-surface-container/80 p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-on-surface">Next steps</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
              Save the actions to suggest at the end of a post: book a call, download a free resource,
              watch a video, join a newsletter, or visit a page.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const id = generateCtaId();
              setStatus(null);
              setCtaLibrary((prev) => [
                ...prev,
                {
                  id,
                  label: "",
                  type: "website",
                  destination: "",
                  traffic_goal: "",
                  instructions: "",
                },
              ]);
              setExpandedCtaId(id);
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200/95"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add next step
          </button>
        </div>

        {ctaLibrary.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-outline-variant/30 px-4 py-6 text-center text-xs leading-relaxed text-zinc-500">
            <p className="font-semibold text-on-surface">No next steps yet</p>
            <p className="mx-auto mt-1 max-w-md">
              Add the main next steps this creator promotes. Example: “Download the leadership checklist”,
              “Book a discovery call”, or “Comment GUIDE”.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {ctaLibrary.map((cta, idx) => {
              const updateCta = (patch: Partial<ClientCta>) => {
                updateCtaAt(idx, patch);
              };
              return (
                <li
                  key={cta.id}
                  className="rounded-xl border border-outline-variant/15 bg-surface-container-low/80 p-2 dark:border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedCtaId((prev) => (prev === cta.id ? null : cta.id))}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-left text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 dark:border-white/10"
                      aria-expanded={expandedCtaId === cta.id}
                    >
                      <span className="truncate">{cta.label.trim() || "Untitled next step"}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
                          expandedCtaId === cta.id ? "rotate-180" : "",
                        )}
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setStatus(null);
                        setCtaLibrary((prev) => prev.filter((_, j) => j !== idx));
                        setExpandedCtaId((prev) => (prev === cta.id ? null : prev));
                      }}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      aria-label="Remove next step"
                      title="Remove next step"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  {expandedCtaId === cta.id ? (
                    <div className="mt-3 rounded-lg border border-outline-variant/10 bg-surface-container/50 p-3 dark:border-white/10">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            Name
                          </label>
                          <input
                            value={cta.label}
                            onChange={(e) => updateCta({ label: e.target.value })}
                            disabled={disabled}
                            placeholder="Download the leadership checklist"
                            className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm font-semibold text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                          />
                        </div>
                        <div className="relative">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            Type
                          </label>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setOpenCtaTypeId((prev) => (prev === cta.id ? null : cta.id))}
                            className="mt-1 flex w-full items-center justify-between gap-3 rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-left text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                            aria-haspopup="listbox"
                            aria-expanded={openCtaTypeId === cta.id}
                          >
                            <span className="truncate">
                              {CTA_TYPES.find((t) => t.id === cta.type)?.label ?? "Other"}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                          </button>
                          {openCtaTypeId === cta.id ? (
                            <div
                              className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-outline-variant/15 bg-[#18181b] py-1 shadow-xl"
                              role="listbox"
                            >
                              {CTA_TYPES.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  role="option"
                                  aria-selected={t.id === cta.type}
                                  onClick={() => {
                                    updateCta({ type: t.id });
                                    setOpenCtaTypeId(null);
                                  }}
                                  className={cn(
                                    "block w-full px-4 py-2.5 text-left text-sm transition-colors",
                                    t.id === cta.type
                                      ? "bg-amber-500/15 text-amber-200"
                                      : "text-zinc-200 hover:bg-white/[0.06]",
                                  )}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500">
                        {CTA_TYPES.find((t) => t.id === cta.type)?.helper ?? ""}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            Link, keyword, or next step
                          </label>
                          <input
                            value={cta.destination}
                            onChange={(e) => updateCta({ destination: e.target.value })}
                            disabled={disabled}
                            placeholder="https://... or comment GUIDE"
                            className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            Why should people take this step?
                          </label>
                          <input
                            value={cta.traffic_goal}
                            onChange={(e) => updateCta({ traffic_goal: e.target.value })}
                            disabled={disabled}
                            placeholder="Help managers get the free checklist"
                            className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          How should this be mentioned? <span className="font-normal normal-case">(optional)</span>
                        </label>
                        <textarea
                          value={cta.instructions ?? ""}
                          onChange={(e) => updateCta({ instructions: e.target.value })}
                          disabled={disabled}
                          rows={2}
                          placeholder="Example: Keep it casual. Mention it only at the end. Do not paste the raw URL in the caption."
                          className="mt-1 w-full resize-y rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/15 pt-4 dark:border-white/10">
          <span className="text-sm text-app-fg-secondary">
            {status ? (
              <span className="text-zinc-500">{status}</span>
            ) : dirty ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">Unsaved next step changes</span>
            ) : (
              <span className="text-zinc-500">Next steps saved</span>
            )}
          </span>
          <button
            type="button"
            disabled={disabled || saveBusy || !dirty}
            onClick={() => void saveCtas()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
          >
            {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {saveBusy ? "Saving..." : "Save next steps"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-outline-variant/15 bg-surface-container/80 p-5 dark:border-white/10">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-on-surface">Visual styles</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
            Pick images from the <Link href="/media?tab=images" className="font-semibold text-amber-700 hover:underline dark:text-amber-400">Media image library</Link>
            {" "}and define how their structure should be reused when making carousels or covers.
          </p>
        </div>
        <GenerationTemplatesPanel
          clientSlug={clientSlug}
          orgSlug={orgSlug}
          disabled={disabled}
        />
      </section>
    </div>
  );
}

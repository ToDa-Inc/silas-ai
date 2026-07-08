"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Clapperboard,
  Info,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { ReelThumbnail } from "@/components/reel-thumbnail";
import { AppSelect } from "@/components/ui/app-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import type { ReelsListSortBy, ReelsMediaType, ScrapedReelRow, SortRule } from "@/lib/api";
import { formatViewsToComments, viewsToCommentsRatio } from "@/lib/reel-comment-view";
import {
  clientApiHeaders,
  contentApiFetch,
  deleteScrapedReelsBulk,
  enqueueReelAnalyzeBulk,
  fetchActiveReelAnalysisJob,
  formatFastApiError,
  getContentApiBase,
  patchScrapedReelBookmark,
} from "@/lib/api-client";
import { analysisSortScore, formatSilasScoreSummary } from "@/lib/silas-score-display";
import {
  formatNicheMatchPercent,
  formatTheirUsualMultiplier,
  getReelProvenance,
  NICHE_SIMILARITY_SCORE_TOOLTIP,
} from "@/lib/reel-provenance";
import { AnalyzeReelModal } from "../components/analyze-reel-modal";
import { RecreateButton } from "@/components/recreate-button";
import { IntelligenceProgressBar } from "../components/intelligence-progress-bar";
import { ReelAnalysisDetailModal } from "../components/reel-analysis-detail-modal";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Page-local sort keys are columns the server can't sort on (joined from
 * reel_analyses, or computed from base columns). They only ever apply as a
 * primary sort over the loaded page.
 */
type LocalSortKey = "total_score" | "comment_view_ratio";
type AnySortKey = ReelsListSortBy | LocalSortKey;

type AnalysisFilter = "all" | "analyzed" | "pending";

/** Mirrors the URL state owned by the page-level Server Component. */
type ServerState = {
  sortRules: SortRule[];
  page: number;
  pageSize: number;
  creator: string;
  outliersOnly: boolean;
  ownReelsOnly: boolean;
  source: string;
  mediaType: ReelsMediaType;
  competitorId: string;
  minViews: number | null;
  maxViews: number | null;
  minLikes: number | null;
  maxLikes: number | null;
  minComments: number | null;
  maxComments: number | null;
  postedAfter: string | null;
  postedBefore: string | null;
  bookmarkedOnly: boolean;
};

type Props = {
  rows: ScrapedReelRow[];
  /** Total matching rows (across all pages) — from X-Total-Count. */
  total: number;
  clientSlug: string;
  orgSlug: string;
  serverState: ServerState;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants & small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Sort keys the backend can ORDER BY directly. */
const SERVER_SORT_KEYS: ReadonlySet<string> = new Set<ReelsListSortBy>([
  "posted_at",
  "posted_date",
  "views",
  "likes",
  "comments",
  "saves",
  "shares",
  "outlier_ratio",
  "similarity_score",
  "video_duration",
  "first_seen_at",
]);

const SORT_KEY_LABELS: Record<AnySortKey, string> = {
  posted_at: "Posted",
  posted_date: "Day posted",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  saves: "Saves",
  shares: "Shares",
  outlier_ratio: "Vs account",
  similarity_score: "Niche fit",
  video_duration: "Duration",
  first_seen_at: "First seen",
  total_score: "Score",
  comment_view_ratio: "C/V",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const BULK_POLL_MS = 2500;
const BULK_MAX_URLS = 20;
const BULK_MAX_DELETE = 50;
const SEGMENT_MS = 20_000;
const STALE_MS = 15 * 60 * 1000;
const MEDIA_TYPE_LABELS: Record<ReelsMediaType, string> = {
  all: "All media",
  short: "text overlay",
  long: "talking head",
  carousel: "Carousel",
};
/** Subtle styling for empty cells (`0` or `—`) so populated values pop. */
const EMPTY_CELL_CLASS = "text-zinc-400 dark:text-app-fg-faint";

function formatPosted(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function startedAtIsStale(startedAt: string | null | undefined): boolean {
  if (!startedAt) return false;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_MS;
}

function rowHasPostUrl(row: ScrapedReelRow): boolean {
  return Boolean(row.post_url?.trim());
}

function isAnalyzable(row: ScrapedReelRow): boolean {
  return Boolean(row.post_url?.trim() && !row.analysis);
}

/**
 * Niche-keyword analyses (source = "keyword_similarity") write to a different
 * payload shape than Silas scoring — the score columns end up null/0. Detect
 * this combo so we render the row's actual content instead of a fake "0/50".
 */
function isNicheMatchOnly(row: ScrapedReelRow): boolean {
  const a = row.analysis;
  if (!a) return false;
  const hasSilasScore =
    a.weighted_total != null || (a.total_score != null && a.total_score > 0);
  return row.source === "keyword_similarity" && !hasSilasScore;
}

/** Compares two rows for the given sort key (always ascending; caller flips). */
function compareForSort(a: ScrapedReelRow, b: ScrapedReelRow, key: AnySortKey): number {
  const num = (va: number | null | undefined, vb: number | null | undefined) => {
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb;
  };
  switch (key) {
    case "views":
      return num(a.views, b.views);
    case "likes":
      return num(a.likes, b.likes);
    case "comments":
      return num(a.comments, b.comments);
    case "saves":
      return num(a.saves, b.saves);
    case "shares":
      return num(a.shares, b.shares);
    case "video_duration":
      return num(a.video_duration, b.video_duration);
    case "comment_view_ratio": {
      const va = viewsToCommentsRatio(a);
      const vb = viewsToCommentsRatio(b);
      return num(va == null ? null : Number(va), vb == null ? null : Number(vb));
    }
    case "outlier_ratio": {
      const va = a.outlier_ratio != null ? Number(a.outlier_ratio) : null;
      const vb = b.outlier_ratio != null ? Number(b.outlier_ratio) : null;
      return num(
        va != null && Number.isFinite(va) ? va : null,
        vb != null && Number.isFinite(vb) ? vb : null,
      );
    }
    case "similarity_score": {
      const va = a.similarity_score != null ? Number(a.similarity_score) : null;
      const vb = b.similarity_score != null ? Number(b.similarity_score) : null;
      return num(
        va != null && Number.isFinite(va) ? va : null,
        vb != null && Number.isFinite(vb) ? vb : null,
      );
    }
    case "posted_at":
    case "first_seen_at": {
      const ka = key === "posted_at" ? a.posted_at : a.first_seen_at;
      const kb = key === "posted_at" ? b.posted_at : b.first_seen_at;
      const ta = ka ? new Date(ka).getTime() : NaN;
      const tb = kb ? new Date(kb).getTime() : NaN;
      const na = Number.isNaN(ta);
      const nb = Number.isNaN(tb);
      if (na && nb) return 0;
      if (na) return 1;
      if (nb) return -1;
      return ta - tb;
    }
    case "total_score": {
      const va = analysisSortScore(a);
      const vb = analysisSortScore(b);
      if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return va - vb;
    }
    default:
      return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SortHeader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Column header with sort affordance.
 *
 * sortLevel: 1-indexed position in the active sort rules (null = not sorting).
 * Clicking cycles: not in sort → desc → asc → removed from sort.
 * Level badge (2, 3…) appears on secondary/tertiary columns so users can see
 * the priority order at a glance.
 */
function SortHeader({
  label,
  sortLevel,
  sortDir,
  onClick,
  hint,
  serverSortable,
}: {
  label: string;
  sortLevel: number | null;
  sortDir: "asc" | "desc";
  onClick: () => void;
  hint?: string;
  serverSortable: boolean;
}) {
  const active = sortLevel !== null;
  const ariaSort = active ? (sortDir === "desc" ? "descending" : "ascending") : "none";
  const hasInfo = Boolean(hint) || !serverSortable;
  const tooltipText = !serverSortable
    ? `${hint ? hint + " " : ""}Sorting only affects reels on this page.`
    : (hint as string);
  const stopBubble = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <th aria-sort={ariaSort} className="py-3 pr-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`group inline-flex items-center gap-0.5 rounded text-left uppercase tracking-widest transition-colors ${
          active
            ? "text-zinc-800 dark:text-app-fg"
            : "text-zinc-500 hover:text-zinc-700 dark:text-app-fg-subtle dark:hover:text-app-fg-muted"
        }`}
        aria-label={`Sort by ${label}${
          active
            ? `, currently ${sortDir === "desc" ? "descending" : "ascending"}, priority ${sortLevel}`
            : ""
        }`}
      >
        <span>{label}</span>
        {hasInfo ? (
          <Tooltip content={tooltipText}>
            <span
              role="img"
              aria-label={`What is ${label}?`}
              tabIndex={0}
              onClick={stopBubble}
              onMouseDown={stopBubble}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              className="inline-flex cursor-help items-center text-zinc-400 transition-colors hover:text-zinc-700 dark:text-app-fg-faint dark:hover:text-app-fg-muted"
            >
              <Info className="h-3 w-3" aria-hidden />
            </span>
          </Tooltip>
        ) : null}
        {active ? (
          sortDir === "desc" ? (
            <ArrowDown className="ml-0.5 h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ArrowUp className="ml-0.5 h-3 w-3 shrink-0" aria-hidden />
          )
        ) : (
          <ChevronsUpDown
            className="ml-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50"
            aria-hidden
          />
        )}
        {active && sortLevel !== null && sortLevel > 1 ? (
          <span
            className="ml-0.5 rounded bg-zinc-200 px-1 text-[8px] font-bold text-zinc-700 dark:bg-white/15 dark:text-app-fg-muted"
            aria-hidden
          >
            {sortLevel}
          </span>
        ) : null}
      </button>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterChip
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: ReactNode;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200/90 bg-white/90 py-0.5 pl-2 pr-1 font-medium text-zinc-700 shadow-sm dark:border-white/10 dark:bg-zinc-900/80 dark:text-app-fg-secondary">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-app-fg-subtle">
        {label}
      </span>
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-200/80 hover:text-zinc-700 dark:text-app-fg-faint dark:hover:bg-white/10 dark:hover:text-app-fg-muted"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Range filters popover
// ─────────────────────────────────────────────────────────────────────────────

type DraftRanges = {
  minViews: string;
  maxViews: string;
  minLikes: string;
  maxLikes: string;
  minComments: string;
  maxComments: string;
  postedAfter: string;
  postedBefore: string;
};

function emptyDraftFromState(s: ServerState): DraftRanges {
  return {
    minViews: s.minViews?.toString() ?? "",
    maxViews: s.maxViews?.toString() ?? "",
    minLikes: s.minLikes?.toString() ?? "",
    maxLikes: s.maxLikes?.toString() ?? "",
    minComments: s.minComments?.toString() ?? "",
    maxComments: s.maxComments?.toString() ?? "",
    postedAfter: s.postedAfter ?? "",
    postedBefore: s.postedBefore ?? "",
  };
}

function RangeInput({
  value,
  onChange,
  placeholder,
  type = "number",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: "number" | "date";
}) {
  return (
    <input
      type={type}
      inputMode={type === "number" ? "numeric" : undefined}
      min={type === "number" ? 0 : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-zinc-200/80 bg-white/90 px-2 text-xs text-zinc-900 shadow-sm transition-colors focus:border-zinc-300/90 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-white/10 dark:bg-zinc-900/80 dark:text-app-fg dark:focus:ring-amber-400/25"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling types (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

type BulkJobPoll = {
  status: string;
  result?: {
    status?: string;
    bulk?: boolean;
    progress?: { done: number; total: number; current_url?: string };
    total?: number;
    succeeded?: number;
    failed?: number;
  } | null;
  error_message?: string | null;
};

type TrackedJobPoll = BulkJobPoll & {
  id?: string;
  job_type?: string;
  started_at?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function IntelligenceReelsTable({
  rows,
  total,
  clientSlug,
  orgSlug,
  serverState,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ─── URL-state setter ────────────────────────────────────────────────────
  // Given a sparse patch of search-params updates, rebuild the URL and push it.
  // Centralizing here keeps every "change a server filter" call site short,
  // and guarantees we always reset to page=1 unless explicitly preserved.
  const pushFilters = useCallback(
    (
      patch: Record<string, string | number | null | undefined>,
      opts: { keepPage?: boolean } = {},
    ) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") {
          next.delete(k);
        } else {
          next.set(k, String(v));
        }
      }
      if (!opts.keepPage && !("page" in patch)) {
        next.delete("page");
      }
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  const resetServerFilters = useCallback(() => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }, [router, pathname, startTransition]);

  // ─── Client-only state ───────────────────────────────────────────────────
  const [detailReelId, setDetailReelId] = useState<string | null>(null);
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  /** Page-local primary sort, used only for non-server-sortable columns (Score, C/V). */
  const [localPrimarySort, setLocalPrimarySort] = useState<{
    key: LocalSortKey;
    dir: "asc" | "desc";
  } | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftRanges, setDraftRanges] = useState<DraftRanges>(() =>
    emptyDraftFromState(serverState),
  );

  // Keep the draft in sync when the URL changes from the outside (back button,
  // chip clear, etc).
  useEffect(() => {
    setDraftRanges(emptyDraftFromState(serverState));
  }, [serverState]);

  // Bulk / job state (unchanged from previous version).
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeInitialUrl, setAnalyzeInitialUrl] = useState<string | null>(null);
  const [analyzeSkipApify, setAnalyzeSkipApify] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  /** Optimistic is_bookmarked keyed by reel id; dropped when props match or request fails. */
  const [bookmarkOverride, setBookmarkOverride] = useState<Record<string, boolean>>({});
  const bookmarkInFlightRef = useRef<Set<string>>(new Set());
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [trackedJobType, setTrackedJobType] = useState<
    "reel_analyze_bulk" | "reel_analyze_url" | null
  >(null);
  const [bulkExpectedTotal, setBulkExpectedTotal] = useState<number | null>(null);
  const [lastJob, setLastJob] = useState<TrackedJobPoll | null>(null);
  const [tick, setTick] = useState(0);
  const headerSelectRef = useRef<HTMLInputElement>(null);
  const segmentDoneRef = useRef<number>(-999);
  const [wallMs, setWallMs] = useState(0);
  const [segmentStartMs, setSegmentStartMs] = useState(0);
  const pollTerminalHandledRef = useRef(false);
  const prevTrackedJobIdRef = useRef<string | null>(null);

  // ─── Debounced text search (page-local) ─────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  // ─── Client-side derivations ────────────────────────────────────────────
  const creatorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.account_username?.trim()) set.add(r.account_username.trim());
    if (serverState.creator) set.add(serverState.creator);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [rows, serverState.creator]);

  const rowsWithBookmarks = useMemo(() => {
    if (Object.keys(bookmarkOverride).length === 0) return rows;
    return rows.map((r) => {
      const o = bookmarkOverride[r.id];
      if (o === undefined) return r;
      if (Boolean(r.is_bookmarked) === o) return r;
      return { ...r, is_bookmarked: o };
    });
  }, [rows, bookmarkOverride]);

  /** Drop optimistic entries once server props agree (or row left the page). */
  useEffect(() => {
    setBookmarkOverride((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of ids) {
        if (bookmarkInFlightRef.current.has(id)) continue;
        const r = rows.find((x) => x.id === id);
        if (r == null) {
          delete next[id];
          changed = true;
          continue;
        }
        if (Boolean(r.is_bookmarked) === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const displayRows = useMemo(() => {
    let out = rowsWithBookmarks;
    if (analysisFilter === "analyzed") {
      out = out.filter((r) => Boolean(r.analysis));
    } else if (analysisFilter === "pending") {
      out = out.filter((r) => isAnalyzable(r));
    }
    if (searchQuery) {
      const q = searchQuery;
      out = out.filter((r) => {
        const u = r.account_username?.toLowerCase() ?? "";
        const h = r.hook_text?.toLowerCase() ?? "";
        const c = r.caption?.toLowerCase() ?? "";
        return u.includes(q) || h.includes(q) || c.includes(q);
      });
    }
    // Page-local primary sort applies only for non-server columns (Score, C/V).
    // For server-sortable columns, ORDER BY is handled by the API.
    if (localPrimarySort) {
      const copy = [...out];
      copy.sort((a, b) => {
        const base = compareForSort(a, b, localPrimarySort.key);
        return localPrimarySort.dir === "asc" ? base : -base;
      });
      out = copy;
    }
    return out;
  }, [rowsWithBookmarks, analysisFilter, searchQuery, localPrimarySort]);

  const toggleBookmark = useCallback(
    async (row: ScrapedReelRow) => {
      const rid = row.id;
      if (bookmarkInFlightRef.current.has(rid)) return;
      const next = !Boolean(row.is_bookmarked);
      setBulkMsg(null);
      setBookmarkOverride((o) => ({ ...o, [rid]: next }));
      bookmarkInFlightRef.current.add(rid);
      try {
        const res = await patchScrapedReelBookmark(clientSlug, orgSlug, rid, next);
        if (!res.ok) {
          setBookmarkOverride((o) => {
            if (Object.keys(o).length === 0) return o;
            const n = { ...o };
            delete n[rid];
            return n;
          });
          setBulkMsg(res.error);
          return;
        }
        startTransition(() => {
          router.refresh();
        });
      } finally {
        bookmarkInFlightRef.current.delete(rid);
      }
    },
    [clientSlug, orgSlug, router, startTransition],
  );

  // ─── Bulk-selection helpers ─────────────────────────────────────────────
  const postUrlVisible = useMemo(
    () => displayRows.filter((r) => rowHasPostUrl(r)),
    [displayRows],
  );

  const selectedPostUrls = useMemo(() => {
    const list: string[] = [];
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      if (!rowHasPostUrl(r)) continue;
      list.push(r.post_url!.trim());
    }
    return list;
  }, [rows, selected]);

  const selectedReelIds = useMemo(() => Array.from(selected), [selected]);

  const bulkSkipApify = useMemo(() => {
    const picked = rows.filter((r) => selected.has(r.id) && rowHasPostUrl(r));
    if (picked.length === 0) return false;
    return picked.every((r) => Boolean(r.analysis));
  }, [rows, selected]);

  const allVisibleSelected =
    postUrlVisible.length > 0 && postUrlVisible.every((r) => selected.has(r.id));
  const someVisibleSelected = postUrlVisible.some((r) => selected.has(r.id));

  useEffect(() => {
    const el = headerSelectRef.current;
    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  // ─── Job polling (unchanged) ────────────────────────────────────────────
  useEffect(() => {
    if (!trackedJobId) return;
    const w = Date.now();
    setWallMs(w);
    const iv = setInterval(() => {
      setWallMs(Date.now());
      setTick((n) => n + 1);
    }, 150);
    return () => clearInterval(iv);
  }, [trackedJobId]);

  useEffect(() => {
    if (trackedJobId !== prevTrackedJobIdRef.current) {
      prevTrackedJobIdRef.current = trackedJobId;
      pollTerminalHandledRef.current = false;
      if (trackedJobId) {
        setLastJob(null);
        segmentDoneRef.current = -999;
        const t = Date.now();
        setWallMs(t);
        setSegmentStartMs(t);
      }
    }
  }, [trackedJobId]);

  useEffect(() => {
    const d = lastJob?.result?.progress?.done;
    if (typeof d === "number" && d !== segmentDoneRef.current) {
      segmentDoneRef.current = d;
      const t = Date.now();
      setWallMs(t);
      setSegmentStartMs(t);
    }
  }, [lastJob?.result?.progress?.done]);

  useEffect(() => {
    if (!clientSlug?.trim() || !orgSlug?.trim()) return;
    let cancelled = false;
    (async () => {
      const res = await fetchActiveReelAnalysisJob(clientSlug, orgSlug);
      if (cancelled || !res.ok || !res.data.active) return;
      // Do not re-bind a zombie job on reload — user would be locked out of selection
      // until Dismiss (checkboxes were tied to trackedJobId). Backend clears stale rows;
      // this guards older rows or clock skew.
      if (startedAtIsStale(res.data.started_at)) return;
      setTrackedJobId(res.data.job_id);
      setTrackedJobType(
        res.data.job_type === "reel_analyze_bulk" ? "reel_analyze_bulk" : "reel_analyze_url",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSlug, orgSlug]);

  useEffect(() => {
    if (!trackedJobId || !clientSlug?.trim() || !orgSlug?.trim()) return;
    let cancelled = false;
    let timeoutClear: ReturnType<typeof setTimeout> | undefined;
    const apiBase = getContentApiBase();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const stopPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = undefined;
    };

    const poll = async () => {
      if (cancelled || pollTerminalHandledRef.current) return;
      try {
        const headersBase = await clientApiHeaders({ orgSlug });
        const jRes = await contentApiFetch(
          `${apiBase}/api/v1/jobs/${encodeURIComponent(trackedJobId)}`,
          { headers: headersBase },
        );
        const job = (await jRes.json().catch(() => ({}))) as TrackedJobPoll;
        if (cancelled) return;
        if (!jRes.ok) {
          pollTerminalHandledRef.current = true;
          stopPolling();
          setBulkMsg(
            formatFastApiError(job as unknown as Record<string, unknown>, "Job status failed"),
          );
          setTrackedJobId(null);
          setTrackedJobType(null);
          setBulkExpectedTotal(null);
          setLastJob(null);
          return;
        }
        setLastJob(job);

        if (job.status === "failed") {
          pollTerminalHandledRef.current = true;
          stopPolling();
          setBulkMsg(job.error_message || "Analysis failed.");
          setTrackedJobId(null);
          setTrackedJobType(null);
          setBulkExpectedTotal(null);
          setLastJob(null);
          return;
        }

        if (job.status === "completed") {
          pollTerminalHandledRef.current = true;
          stopPolling();
          const isBulk = job.job_type === "reel_analyze_bulk" || job.result?.bulk === true;
          if (isBulk && job.result?.bulk) {
            const r = job.result;
            setBulkMsg(
              `Finished: ${r.succeeded ?? 0}/${r.total ?? "?"} succeeded${
                r.failed ? `, ${r.failed} failed` : ""
              }.`,
            );
            setSelected(new Set());
            router.refresh();
            timeoutClear = setTimeout(() => {
              if (!cancelled) {
                setTrackedJobId(null);
                setTrackedJobType(null);
                setBulkExpectedTotal(null);
                setLastJob(null);
              }
            }, 2800);
          } else {
            setBulkMsg(null);
            router.refresh();
            timeoutClear = setTimeout(() => {
              if (!cancelled) {
                setTrackedJobId(null);
                setTrackedJobType(null);
                setBulkExpectedTotal(null);
                setLastJob(null);
              }
            }, 800);
          }
        }
      } catch {
        if (!cancelled) setBulkMsg("Couldn't check progress.");
      }
    };

    intervalId = setInterval(() => void poll(), BULK_POLL_MS);
    void poll();

    return () => {
      cancelled = true;
      stopPolling();
      if (timeoutClear) clearTimeout(timeoutClear);
    };
  }, [trackedJobId, clientSlug, orgSlug, router]);

  // ─── Multi-sort helpers ─────────────────────────────────────────────────

  /**
   * O(1) lookup from column name → { level, dir }.
   * level is 1-indexed (1 = primary sort, 2 = secondary, etc.).
   * Only covers server-sortable columns that are in sortRules.
   */
  const sortInfoMap = useMemo(
    () =>
      new Map(
        serverState.sortRules.map((r, i) => [r.col, { level: i + 1, dir: r.dir }] as const),
      ),
    [serverState.sortRules],
  );

  /** Push a new set of sort rules to the URL (up to 3). */
  const pushSortRules = useCallback(
    (rules: SortRule[]) => {
      const val = rules.length ? rules.map((r) => `${r.col}:${r.dir}`).join(",") : null;
      pushFilters({ sort: val, page: null });
    },
    [pushFilters],
  );

  // ─── Sort handlers ──────────────────────────────────────────────────────
  /**
   * Click on a column header.
   *
   * Server-sortable columns: cycles through → add desc → toggle asc → remove.
   * Multiple columns can be active simultaneously (up to 3); their order in
   * the URL determines priority.
   *
   * Non-server columns (Score, C/V): page-local primary sort, same 3-state
   * cycle. These are sorted over the already-API-sorted page.
   */
  const handleSort = useCallback(
    (key: AnySortKey) => {
      if (SERVER_SORT_KEYS.has(key)) {
        setLocalPrimarySort(null);
        const col = key as ReelsListSortBy;
        const rules = serverState.sortRules;
        const existing = rules.find((r) => r.col === col);
        if (!existing) {
          pushSortRules([...rules, { col, dir: "desc" }]);
        } else if (existing.dir === "desc") {
          pushSortRules(rules.map((r) => (r.col === col ? { ...r, dir: "asc" as const } : r)));
        } else {
          pushSortRules(rules.filter((r) => r.col !== col));
        }
      } else {
        // Page-local primary for joined/computed columns.
        const local = key as LocalSortKey;
        setLocalPrimarySort((cur) => {
          if (!cur || cur.key !== local) return { key: local, dir: "desc" };
          if (cur.dir === "desc") return { key: local, dir: "asc" };
          return null;
        });
      }
    },
    [pushSortRules, serverState.sortRules],
  );

  // ─── Selection helpers ──────────────────────────────────────────────────
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of postUrlVisible) next.delete(r.id);
      } else {
        for (const r of postUrlVisible) next.add(r.id);
      }
      return next;
    });
  }

  async function runBulkAnalyze() {
    if (!clientSlug.trim() || !orgSlug.trim()) {
      setBulkMsg("Missing client or organization context.");
      return;
    }
    const urls = selectedPostUrls.slice(0, BULK_MAX_URLS);
    if (!urls.length) {
      setBulkMsg("Select at least one reel that has a post link.");
      return;
    }
    setBulkMsg(null);
    const enq = await enqueueReelAnalyzeBulk(clientSlug, orgSlug, urls, {
      skip_apify: bulkSkipApify,
    });
    if (!enq.ok) {
      setBulkMsg(enq.error);
      return;
    }
    setBulkExpectedTotal(urls.length);
    setTrackedJobType("reel_analyze_bulk");
    setTrackedJobId(enq.job_id);
  }

  function openBulkDeleteConfirm() {
    if (selectedReelIds.length === 0) {
      setBulkMsg("Select at least one reel to delete.");
      return;
    }
    setDeleteConfirmOpen(true);
  }

  async function executeBulkDelete() {
    if (!clientSlug.trim() || !orgSlug.trim()) {
      setBulkMsg("Missing client or organization context.");
      return;
    }
    const ids = selectedReelIds.slice(0, BULK_MAX_DELETE);
    if (!ids.length) return;
    setBulkMsg(null);
    setDeleteBusy(true);
    try {
      const res = await deleteScrapedReelsBulk(clientSlug, orgSlug, ids);
      if (!res.ok) {
        setBulkMsg(res.error);
        return;
      }
      setSelected(new Set());
      setDeleteConfirmOpen(false);
      setBulkMsg(
        res.deleted === 1
          ? "Deleted 1 reel."
          : `Deleted ${res.deleted.toLocaleString()} reels.`,
      );
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  // ─── Range filter apply/clear ───────────────────────────────────────────
  const applyRanges = useCallback(() => {
    const toNum = (s: string) => {
      const t = s.trim();
      if (!t) return null;
      const n = Number.parseInt(t, 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    pushFilters({
      min_views: toNum(draftRanges.minViews),
      max_views: toNum(draftRanges.maxViews),
      min_likes: toNum(draftRanges.minLikes),
      max_likes: toNum(draftRanges.maxLikes),
      min_comments: toNum(draftRanges.minComments),
      max_comments: toNum(draftRanges.maxComments),
      posted_after: draftRanges.postedAfter || null,
      posted_before: draftRanges.postedBefore || null,
      page: null,
    });
    setFiltersOpen(false);
  }, [draftRanges, pushFilters]);

  const hasAnyDraftRange =
    Object.values(draftRanges).some((v) => v.trim() !== "");

  const clearDraftRanges = () => {
    setDraftRanges({
      minViews: "",
      maxViews: "",
      minLikes: "",
      maxLikes: "",
      minComments: "",
      maxComments: "",
      postedAfter: "",
      postedBefore: "",
    });
  };

  // ─── Progress bar derivations (unchanged) ───────────────────────────────
  /** Blocks starting new analysis — not row selection or delete. */
  const disableReelAnalysis = Boolean(trackedJobId);
  const staleRunning = Boolean(
    trackedJobId &&
      lastJob &&
      (lastJob.status === "running" || lastJob.status === "queued") &&
      startedAtIsStale(lastJob.started_at),
  );

  const jt = lastJob?.job_type ?? trackedJobType ?? "";
  const prog = lastJob?.result?.progress;
  const totalSteps = Math.max(
    1,
    typeof prog?.total === "number"
      ? prog.total
      : jt === "reel_analyze_bulk"
        ? (bulkExpectedTotal ?? 1)
        : 1,
  );
  const done =
    typeof prog?.done === "number" ? Math.min(Math.max(0, prog.done), totalSteps) : 0;
  const floor = (done / totalSteps) * 100;
  const segSpan = (100 / totalSteps) * 0.88;
  const elapsed = wallMs - segmentStartMs;
  const tEase = Math.min(1, elapsed / SEGMENT_MS);
  let barPct = 0;
  if (!trackedJobId) barPct = 0;
  else if (lastJob?.status === "failed") barPct = 10;
  else if (lastJob?.status === "completed") barPct = 100;
  else if (!lastJob) barPct = 6;
  else
    barPct = Math.min(
      floor + tEase * segSpan,
      done < totalSteps ? floor + segSpan : 99,
    );
  void tick;

  let progressLabel = "";
  if (trackedJobId) {
    if (!lastJob) progressLabel = "Connecting to your analysis job…";
    else if (lastJob.status === "failed") progressLabel = "Stopped.";
    else if (lastJob.status === "completed") progressLabel = "Done.";
    else if (prog && prog.total > 0)
      progressLabel = `Reel ${prog.done + 1} of ${prog.total} — analyzing…`;
    else if (jt === "reel_analyze_url") progressLabel = "Studying this reel — usually about a minute…";
    else progressLabel = "Analyzing selected reels…";
  }

  // ─── Pagination derivations ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / serverState.pageSize));
  const safePage = Math.min(serverState.page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * serverState.pageSize + 1;
  const rangeEnd = Math.min(safePage * serverState.pageSize, total);

  // ─── Active filter chip data ────────────────────────────────────────────
  const sortChipText = (() => {
    if (localPrimarySort) {
      return `${SORT_KEY_LABELS[localPrimarySort.key]} ${localPrimarySort.dir === "desc" ? "↓" : "↑"} · this page`;
    }
    const rules = serverState.sortRules;
    if (!rules.length) return null;
    // Single posted_at desc is the implicit default — no chip needed.
    if (rules.length === 1 && rules[0].col === "posted_at" && rules[0].dir === "desc") return null;
    return rules
      .map((r) => `${SORT_KEY_LABELS[r.col as AnySortKey] ?? r.col} ${r.dir === "desc" ? "↓" : "↑"}`)
      .join(", ");
  })();

  const fmtRange = (lo: number | null, hi: number | null, suffix = "") => {
    if (lo != null && hi != null) return `${lo.toLocaleString()}–${hi.toLocaleString()}${suffix}`;
    if (lo != null) return `≥ ${lo.toLocaleString()}${suffix}`;
    if (hi != null) return `≤ ${hi.toLocaleString()}${suffix}`;
    return null;
  };

  const viewsChip = fmtRange(serverState.minViews, serverState.maxViews);
  const likesChip = fmtRange(serverState.minLikes, serverState.maxLikes);
  const commentsChip = fmtRange(serverState.minComments, serverState.maxComments);
  const mediaTypeChip =
    serverState.mediaType !== "all" ? MEDIA_TYPE_LABELS[serverState.mediaType] : null;
  const postedChip = (() => {
    if (serverState.postedAfter && serverState.postedBefore)
      return `${serverState.postedAfter} → ${serverState.postedBefore}`;
    if (serverState.postedAfter) return `from ${serverState.postedAfter}`;
    if (serverState.postedBefore) return `until ${serverState.postedBefore}`;
    return null;
  })();

  const serverFilterCount =
    (serverState.creator ? 1 : 0) +
    (mediaTypeChip ? 1 : 0) +
    (viewsChip ? 1 : 0) +
    (likesChip ? 1 : 0) +
    (commentsChip ? 1 : 0) +
    (postedChip ? 1 : 0) +
    (serverState.bookmarkedOnly ? 1 : 0);
  const clientFilterCount =
    (analysisFilter !== "all" ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (sortChipText ? 1 : 0);
  const activeFilterCount = serverFilterCount + clientFilterCount;

  const clearAllFilters = () => {
    setAnalysisFilter("all");
    setSearchInput("");
    setSearchQuery("");
    setLocalPrimarySort(null);
    resetServerFilters();
  };

  // Page-size handler keeps us on a sensible page after the size changes.
  const onPageSizeChange = (v: string) => {
    const next = Number.parseInt(v, 10);
    if (!Number.isFinite(next) || next <= 0) return;
    pushFilters({ per: next, page: 1 });
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        {trackedJobId ? (
          <IntelligenceProgressBar
            label={progressLabel}
            percent={barPct}
            status={
              lastJob?.status === "running" ||
              lastJob?.status === "queued" ||
              lastJob?.status === "completed" ||
              lastJob?.status === "failed"
                ? lastJob.status
                : null
            }
            staleHint={staleRunning}
            onDismissStale={() => {
              setTrackedJobId(null);
              setTrackedJobType(null);
              setBulkExpectedTotal(null);
              setLastJob(null);
              setBulkMsg(null);
            }}
          />
        ) : null}

        {/* Primary toolbar — every control sits on h-9 baseline. */}
        <div className="flex flex-wrap items-center gap-2">
          <AppSelect
            ariaLabel="Filter by creator"
            triggerClassName="h-9 min-w-[160px] py-0"
            value={serverState.creator}
            onChange={(v) => pushFilters({ creator: v || null, page: null })}
            options={[
              { value: "", label: "All creators" },
              ...creatorOptions.map((u) => ({ value: u, label: `@${u}` })),
            ]}
          />
          <AppSelect
            ariaLabel="Filter by analysis state"
            triggerClassName="h-9 min-w-[160px] py-0"
            value={analysisFilter}
            onChange={(v) => setAnalysisFilter(v as AnalysisFilter)}
            options={[
              { value: "all", label: "All reels" },
              { value: "analyzed", label: "Analyzed only" },
              { value: "pending", label: "Not analyzed" },
            ]}
          />
          <AppSelect
            ariaLabel="Filter by media type"
            triggerClassName="h-9 min-w-[140px] py-0"
            value={serverState.mediaType}
            onChange={(v) =>
              pushFilters({ media_type: v && v !== "all" ? v : null, page: null })
            }
            options={[
              { value: "all", label: "All media" },
              { value: "short", label: "text overlay" },
              { value: "long", label: "talking head" },
              { value: "carousel", label: "Carousel" },
            ]}
          />
          <AppSelect
            ariaLabel="Bookmarked filter"
            triggerClassName="h-9 min-w-[140px] py-0"
            value={serverState.bookmarkedOnly ? "bookmarked" : "all"}
            onChange={(v) =>
              pushFilters({
                bookmarked: v === "bookmarked" ? 1 : null,
                page: null,
              })
            }
            options={[
              { value: "all", label: "Full catalog" },
              { value: "bookmarked", label: "Bookmarked" },
            ]}
          />
          <div className="glass-inset relative flex h-9 min-w-[220px] items-center rounded-lg border border-zinc-200/80 bg-white/80 text-sm text-zinc-900 shadow-sm transition-colors focus-within:border-zinc-300/90 focus-within:ring-2 focus-within:ring-amber-500/30 dark:border-white/10 dark:bg-zinc-900/80 dark:text-app-fg dark:focus-within:ring-amber-400/25">
            <Search
              className="ml-2.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-app-fg-faint"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search account, hook, caption…"
              className="h-full w-full bg-transparent px-2 text-sm placeholder:text-zinc-400 focus:outline-none dark:placeholder:text-app-fg-faint"
              aria-label="Search reels by account, hook, or caption (current page)"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                }}
                className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:text-app-fg-faint dark:hover:bg-white/10 dark:hover:text-app-fg-muted"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* Range Filters — single popover so the toolbar stays clean. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                serverFilterCount > 0
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200"
                  : "border-zinc-200/80 bg-white/80 text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-zinc-900/80 dark:text-app-fg-secondary dark:hover:bg-white/[0.06]"
              }`}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Filters
              {serverFilterCount > 0 ? (
                <span className="ml-0.5 rounded bg-amber-600/80 px-1 text-[10px] font-bold text-white dark:bg-amber-500/90">
                  {serverFilterCount}
                </span>
              ) : null}
            </button>

            {filtersOpen ? (
              <div
                className="absolute right-0 top-full z-40 mt-2 w-[320px] rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xl dark:border-white/12 dark:bg-zinc-900"
                role="dialog"
                aria-label="Range filters"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-app-fg-muted">
                    Range filters
                  </h3>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-app-fg"
                    aria-label="Close filters"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {[
                    {
                      label: "Views",
                      minKey: "minViews" as const,
                      maxKey: "maxViews" as const,
                    },
                    {
                      label: "Likes",
                      minKey: "minLikes" as const,
                      maxKey: "maxLikes" as const,
                    },
                    {
                      label: "Comments",
                      minKey: "minComments" as const,
                      maxKey: "maxComments" as const,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-app-fg-subtle">
                        {row.label}
                      </label>
                      <div className="flex items-center gap-2">
                        <RangeInput
                          value={draftRanges[row.minKey]}
                          onChange={(v) =>
                            setDraftRanges((d) => ({ ...d, [row.minKey]: v }))
                          }
                          placeholder="min"
                        />
                        <span className="text-zinc-400 dark:text-app-fg-faint" aria-hidden>
                          –
                        </span>
                        <RangeInput
                          value={draftRanges[row.maxKey]}
                          onChange={(v) =>
                            setDraftRanges((d) => ({ ...d, [row.maxKey]: v }))
                          }
                          placeholder="max"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-app-fg-subtle">
                      Posted between
                    </label>
                    <div className="flex items-center gap-2">
                      <RangeInput
                        type="date"
                        value={draftRanges.postedAfter}
                        onChange={(v) =>
                          setDraftRanges((d) => ({ ...d, postedAfter: v }))
                        }
                        placeholder="from"
                      />
                      <span className="text-zinc-400 dark:text-app-fg-faint" aria-hidden>
                        –
                      </span>
                      <RangeInput
                        type="date"
                        value={draftRanges.postedBefore}
                        onChange={(v) =>
                          setDraftRanges((d) => ({ ...d, postedBefore: v }))
                        }
                        placeholder="to"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={clearDraftRanges}
                    disabled={!hasAnyDraftRange}
                    className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-app-fg-subtle dark:hover:text-app-fg"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={applyRanges}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Tooltip
              content={
                selectedReelIds.length === 0
                  ? "Select reels to delete"
                  : selectedReelIds.length > BULK_MAX_DELETE
                    ? `Delete up to ${BULK_MAX_DELETE} at a time (${selectedReelIds.length} selected)`
                    : `Delete ${selectedReelIds.length} selected reel${selectedReelIds.length === 1 ? "" : "s"}`
              }
            >
              <button
                type="button"
                aria-label={
                  selectedReelIds.length === 0
                    ? "Delete selected reels"
                    : `Delete ${selectedReelIds.length} selected reels`
                }
                disabled={deleteBusy || selectedReelIds.length === 0}
                onClick={() => openBulkDeleteConfirm()}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-app-divider text-app-fg-muted transition-colors hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
              >
                {deleteBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
              </button>
            </Tooltip>
            <button
              type="button"
              disabled={disableReelAnalysis || deleteBusy || selectedPostUrls.length === 0}
              onClick={() => void runBulkAnalyze()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-200"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Analyze selected
              {selectedPostUrls.length > 0 ? ` (${selectedPostUrls.length})` : ""}
            </button>
          </div>
        </div>

        {selectedPostUrls.length > BULK_MAX_URLS ? (
          <span className="text-[10px] text-amber-800/90 dark:text-amber-200/80">
            Up to {BULK_MAX_URLS} reels per analyze batch.
          </span>
        ) : null}
        {bulkMsg ? (
          <p
            className={
              /fail|error|couldn't|missing/i.test(bulkMsg)
                ? "text-xs text-red-500 dark:text-red-400"
                : "text-xs text-app-fg-muted"
            }
            role={/fail|error|couldn't|missing/i.test(bulkMsg) ? "alert" : "status"}
          >
            {bulkMsg}
          </p>
        ) : null}
        {isPending ? (
          <p
            className="inline-flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Updating reels…
          </p>
        ) : null}

        {/* Result count + active-filter chip strip */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-zinc-500 dark:text-app-fg-subtle">
            {total === 0
              ? "No reels"
              : displayRows.length === rows.length
                ? `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString()}`
                : `Showing ${displayRows.length} of ${rows.length} on this page (${total.toLocaleString()} total)`}
          </span>
          {activeFilterCount > 0 ? (
            <>
              <span className="text-zinc-300 dark:text-app-fg-faint" aria-hidden>
                ·
              </span>
              {serverState.creator ? (
                <FilterChip
                  label="Creator"
                  value={`@${serverState.creator}`}
                  onClear={() => pushFilters({ creator: null, page: null })}
                />
              ) : null}
              {viewsChip ? (
                <FilterChip
                  label="Views"
                  value={viewsChip}
                  onClear={() =>
                    pushFilters({ min_views: null, max_views: null, page: null })
                  }
                />
              ) : null}
              {mediaTypeChip ? (
                <FilterChip
                  label="Media"
                  value={mediaTypeChip}
                  onClear={() => pushFilters({ media_type: null, page: null })}
                />
              ) : null}
              {likesChip ? (
                <FilterChip
                  label="Likes"
                  value={likesChip}
                  onClear={() =>
                    pushFilters({ min_likes: null, max_likes: null, page: null })
                  }
                />
              ) : null}
              {commentsChip ? (
                <FilterChip
                  label="Comments"
                  value={commentsChip}
                  onClear={() =>
                    pushFilters({ min_comments: null, max_comments: null, page: null })
                  }
                />
              ) : null}
              {postedChip ? (
                <FilterChip
                  label="Posted"
                  value={postedChip}
                  onClear={() =>
                    pushFilters({ posted_after: null, posted_before: null, page: null })
                  }
                />
              ) : null}
              {serverState.bookmarkedOnly ? (
                <FilterChip
                  label="Bookmarked"
                  value="Only starred reels"
                  onClear={() => pushFilters({ bookmarked: null, page: null })}
                />
              ) : null}
              {analysisFilter !== "all" ? (
                <FilterChip
                  label="Analysis"
                  value={analysisFilter === "analyzed" ? "Analyzed only" : "Not analyzed"}
                  onClear={() => setAnalysisFilter("all")}
                />
              ) : null}
              {searchQuery ? (
                <FilterChip
                  label="Search"
                  value={`"${searchQuery}"`}
                  onClear={() => {
                    setSearchInput("");
                    setSearchQuery("");
                  }}
                />
              ) : null}
              {sortChipText ? (
                <FilterChip
                  label="Sort"
                  value={sortChipText}
                  onClear={() => {
                    if (localPrimarySort) {
                      setLocalPrimarySort(null);
                    } else {
                      pushSortRules([]);
                    }
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] font-semibold text-amber-600 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Clear all
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={`overflow-x-auto rounded-xl border border-zinc-200/90 bg-zinc-50/90 transition-opacity duration-150 dark:border-white/10 dark:bg-zinc-950/60 ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <table className="w-full min-w-[1200px] border-collapse text-left [&_td]:cursor-default">
          <thead>
            <tr className="border-b border-zinc-200/90 text-[10px] uppercase tracking-widest text-zinc-500 dark:border-white/10 dark:text-app-fg-subtle">
              <th className="w-10 px-2 py-3 font-medium">
                {postUrlVisible.length > 0 ? (
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-zinc-400 accent-amber-600"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all reels with a post link on this page"
                  />
                ) : null}
              </th>
              <th className="px-1 py-3 pr-2 font-medium tabular-nums">#</th>
              <th className="w-10 py-3 pr-1 text-center font-medium" title="Bookmark for replicate">
                <span className="sr-only">Bookmark</span>
                <Star className="mx-auto h-3.5 w-3.5 text-zinc-400 dark:text-app-fg-faint" aria-hidden />
              </th>
              <th className="py-3 pr-2 font-medium">Thumb</th>
              <th className="py-3 pr-2 font-medium">Account</th>
              <SortHeader
                label="Score"
                hint="Silas score after analysis, or open niche fit from View analysis. Niche fit % is in its own column."
                serverSortable={false}
                sortLevel={localPrimarySort?.key === "total_score" ? 1 : null}
                sortDir={localPrimarySort?.dir ?? "desc"}
                onClick={() => handleSort("total_score")}
              />
              <SortHeader
                label="Views"
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("views")?.level ?? null) : null}
                sortDir={sortInfoMap.get("views")?.dir ?? "desc"}
                onClick={() => handleSort("views")}
              />
              <SortHeader
                label="Vs account"
                hint="Views vs this creator's usual posts on file — above ~1× is hotter than their baseline (breakout-style read)."
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("outlier_ratio")?.level ?? null) : null}
                sortDir={sortInfoMap.get("outlier_ratio")?.dir ?? "desc"}
                onClick={() => handleSort("outlier_ratio")}
              />
              <SortHeader
                label="Niche fit"
                hint={NICHE_SIMILARITY_SCORE_TOOLTIP}
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("similarity_score")?.level ?? null) : null}
                sortDir={sortInfoMap.get("similarity_score")?.dir ?? "desc"}
                onClick={() => handleSort("similarity_score")}
              />
              <SortHeader
                label="Comments"
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("comments")?.level ?? null) : null}
                sortDir={sortInfoMap.get("comments")?.dir ?? "desc"}
                onClick={() => handleSort("comments")}
              />
              <SortHeader
                label="C/V"
                hint="Comments divided by views. Higher % = more comments per view."
                serverSortable={false}
                sortLevel={localPrimarySort?.key === "comment_view_ratio" ? 1 : null}
                sortDir={localPrimarySort?.dir ?? "desc"}
                onClick={() => handleSort("comment_view_ratio")}
              />
              <SortHeader
                label="Saves"
                hint="Saves when Instagram provides the number — it's often missing."
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("saves")?.level ?? null) : null}
                sortDir={sortInfoMap.get("saves")?.dir ?? "desc"}
                onClick={() => handleSort("saves")}
              />
              <SortHeader
                label="Shares"
                hint="Shares when available from Instagram — not shown for every reel."
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("shares")?.level ?? null) : null}
                sortDir={sortInfoMap.get("shares")?.dir ?? "desc"}
                onClick={() => handleSort("shares")}
              />
              <SortHeader
                label="Likes"
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("likes")?.level ?? null) : null}
                sortDir={sortInfoMap.get("likes")?.dir ?? "desc"}
                onClick={() => handleSort("likes")}
              />
              <SortHeader
                label="Dur."
                hint="Length in seconds when Instagram includes it."
                serverSortable
                sortLevel={!localPrimarySort ? (sortInfoMap.get("video_duration")?.level ?? null) : null}
                sortDir={sortInfoMap.get("video_duration")?.dir ?? "desc"}
                onClick={() => handleSort("video_duration")}
              />
              <SortHeader
                label="Posted"
                serverSortable
                sortLevel={
                  !localPrimarySort
                    ? (sortInfoMap.get("posted_date")?.level ??
                        sortInfoMap.get("posted_at")?.level ??
                        null)
                    : null
                }
                sortDir={
                  sortInfoMap.get("posted_date")?.dir ??
                  sortInfoMap.get("posted_at")?.dir ??
                  "desc"
                }
                onClick={() => handleSort("posted_date")}
              />
              <th className="py-3 pr-2 font-medium">Open / recreate</th>
            </tr>
          </thead>
          <tbody className="text-xs text-zinc-800 dark:text-app-fg-secondary">
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={17}
                  className="py-12 text-center text-sm text-zinc-500 dark:text-app-fg-muted"
                >
                  {total === 0
                    ? "No reels match the current filters."
                    : "No reels match on this page — try clearing the page-local search/analysis filter."}
                </td>
              </tr>
            ) : null}
            {displayRows.map((row, i) => {
              const a = row.analysis;
              const nicheMatch = isNicheMatchOnly(row);
              const nicheFitLabel = formatNicheMatchPercent(row.similarity_score);
              const silas = a && !nicheMatch ? formatSilasScoreSummary(a) : null;
              const canAnalyze = isAnalyzable(row);
              const hasPost = rowHasPostUrl(row);
              const rowIndex = (safePage - 1) * serverState.pageSize + i;
              return (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100/90 transition-colors hover:bg-zinc-100/80 dark:border-white/[0.06] dark:hover:bg-white/[0.06]"
                >
                  <td className="px-2 py-2.5 align-middle">
                    {hasPost ? (
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-zinc-400 accent-amber-600"
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select reel @${row.account_username}`}
                      />
                    ) : null}
                  </td>
                  <td className="px-1 py-2.5 pr-2 align-middle tabular-nums text-zinc-500 dark:text-app-fg-subtle">
                    {rowIndex + 1}
                  </td>
                  <td className="py-2.5 pr-1 align-middle text-center">
                    <Tooltip
                      content={
                        row.is_bookmarked
                          ? "Remove from replicate shortlist"
                          : "Save to replicate shortlist"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => void toggleBookmark(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-[transform,colors,opacity] duration-150 ease-out hover:bg-zinc-200/80 hover:text-amber-600 active:scale-[0.92] dark:text-app-fg-muted dark:hover:bg-white/10 dark:hover:text-amber-400"
                        aria-label={
                          row.is_bookmarked
                            ? "Remove bookmark from replicate shortlist"
                            : "Bookmark for replicate shortlist"
                        }
                        aria-pressed={Boolean(row.is_bookmarked)}
                      >
                        <Star
                          className={`h-4 w-4 shrink-0 transition-[fill,color,transform] duration-200 ease-out ${
                            row.is_bookmarked
                              ? "scale-105 fill-amber-400 text-amber-600 dark:fill-amber-500/90 dark:text-amber-300"
                              : "scale-100"
                          }`}
                          aria-hidden
                        />
                      </button>
                    </Tooltip>
                  </td>
                  <td className="py-2.5 pr-2 align-middle">
                    <ReelThumbnail
                      src={row.thumbnail_url}
                      alt={`@${row.account_username} reel`}
                      href={row.post_url}
                      size="sm"
                    />
                  </td>
                  <td className="py-2.5 pr-2 align-middle font-medium text-zinc-900 dark:text-app-fg">
                    <div className="flex flex-col gap-0.5">
                      <span>@{row.account_username}</span>
                      <Tooltip content={getReelProvenance(row).trustHint}>
                        <span className="w-fit rounded-md bg-zinc-200/80 px-1.5 py-px text-[10px] font-semibold text-zinc-700 dark:bg-white/12 dark:text-app-fg-muted">
                          {getReelProvenance(row).sourceLabel}
                        </span>
                      </Tooltip>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 align-middle">
                    {a && nicheMatch ? (
                      <Tooltip content="Niche fit analysis — open for details.">
                        <button
                          type="button"
                          onClick={() => setDetailReelId(row.id)}
                          className="w-fit text-left text-[10px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
                        >
                          View analysis
                        </button>
                      </Tooltip>
                    ) : a ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap text-[10px] font-semibold text-emerald-700 dark:text-emerald-300/95">
                          {silas ? (
                            <>
                              {silas.scoreText}
                              <span className="font-normal opacity-80">{silas.maxSuffix}</span>
                              {silas.ratingText ? ` · ${silas.ratingText}` : ""}
                            </>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailReelId(row.id)}
                          className="w-fit text-left text-[10px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
                        >
                          View analysis
                        </button>
                        {hasPost ? (
                          <Tooltip content="Refresh the score using saved data — no new download.">
                            <button
                              type="button"
                              disabled={disableReelAnalysis}
                              onClick={() => {
                                setAnalyzeSkipApify(true);
                                setAnalyzeInitialUrl(row.post_url!.trim());
                                setAnalyzeOpen(true);
                              }}
                              className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300"
                            >
                              <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                              Re-analyze
                            </button>
                          </Tooltip>
                        ) : null}
                      </div>
                    ) : canAnalyze ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] uppercase tracking-wide text-zinc-500 dark:text-app-fg-muted">
                          Not scored yet
                        </span>
                        <Tooltip content="Study this reel — full analysis from the post link.">
                          <button
                            type="button"
                            disabled={disableReelAnalysis}
                            onClick={() => {
                              setAnalyzeSkipApify(false);
                              setAnalyzeInitialUrl(row.post_url!.trim());
                              setAnalyzeOpen(true);
                            }}
                            className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300"
                          >
                            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                            Analyze
                          </button>
                        </Tooltip>
                      </div>
                    ) : (
                      <Tooltip content="No post link on file — refresh data for this source, then try again.">
                        <span className={EMPTY_CELL_CLASS}>—</span>
                      </Tooltip>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums">
                    {row.views != null ? row.views.toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums">
                    {row.outlier_ratio != null ? (
                      <Tooltip
                        content={`How this reel's views compare with this account's usual posts — well above 1× is a breakout.`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 font-bold tabular-nums ${
                            row.is_outlier === true
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-zinc-600 dark:text-app-fg-secondary"
                          }`}
                        >
                          <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
                          {formatTheirUsualMultiplier(row.outlier_ratio) ?? `${Number(row.outlier_ratio).toFixed(1)}×`}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className={EMPTY_CELL_CLASS}>—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums">
                    {nicheFitLabel ? (
                      <Tooltip content={NICHE_SIMILARITY_SCORE_TOOLTIP}>
                        <span className="inline-flex items-center gap-1 font-bold tabular-nums text-purple-600 dark:text-purple-400">
                          <Target className="h-3 w-3 shrink-0" aria-hidden />
                          {nicheFitLabel}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className={EMPTY_CELL_CLASS}>—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums">
                    {row.comments != null ? row.comments.toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums font-medium text-zinc-900 dark:text-app-fg">
                    {formatViewsToComments(row)}
                  </td>
                  <td
                    className={`py-2.5 pr-2 align-middle tabular-nums ${
                      row.saves != null && row.saves > 0 ? "" : EMPTY_CELL_CLASS
                    }`}
                  >
                    {row.saves != null ? row.saves.toLocaleString() : "—"}
                  </td>
                  <td
                    className={`py-2.5 pr-2 align-middle tabular-nums ${
                      row.shares != null && row.shares > 0 ? "" : EMPTY_CELL_CLASS
                    }`}
                  >
                    {row.shares != null ? row.shares.toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums">
                    {row.likes != null ? row.likes.toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 pr-2 align-middle tabular-nums">
                    {row.video_duration != null ? `${row.video_duration}s` : "—"}
                  </td>
                  <td className="py-2.5 pr-2 align-middle text-zinc-600 dark:text-app-fg-muted">
                    {formatPosted(row.posted_at)}
                  </td>
                  <td className="py-2.5 align-middle">
                    {row.post_url ? (
                      <div className="flex flex-col items-start gap-1">
                        <a
                          href={row.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-amber-600 hover:underline dark:text-amber-400"
                        >
                          ↗
                        </a>
                        <Tooltip content="Make a version for your client in Generate — same idea, your voice.">
                          <RecreateButton
                            reel={row}
                            clientSlug={clientSlug}
                            orgSlug={orgSlug}
                            disabled={Boolean(disableReelAnalysis)}
                            disabledHint="An analysis job is running. Wait for it to finish or dismiss the stalled bar."
                            renderTrigger={({ open, disabled }) => (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={open}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300/90"
                              >
                                <Clapperboard className="h-3 w-3 shrink-0" aria-hidden />
                                Recreate
                              </button>
                            )}
                          />
                        </Tooltip>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > 0 ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-[11px] text-zinc-600 dark:text-app-fg-muted">
            Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AppSelect
              ariaLabel="Rows per page"
              triggerClassName="h-8 min-w-[120px] py-0 text-[11px]"
              value={String(serverState.pageSize)}
              onChange={onPageSizeChange}
              options={PAGE_SIZE_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} per page`,
              }))}
            />
            {totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => pushFilters({ page: Math.max(1, safePage - 1) }, { keepPage: true })}
                  className="rounded-lg border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-app-fg-secondary dark:hover:bg-white/[0.06]"
                >
                  Previous
                </button>
                <span className="px-2 text-[11px] text-zinc-600 dark:text-app-fg-muted">
                  Page {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => pushFilters({ page: Math.min(totalPages, safePage + 1) }, { keepPage: true })}
                  className="rounded-lg border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-app-fg-secondary dark:hover:bg-white/[0.06]"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <ReelAnalysisDetailModal
        open={detailReelId != null}
        onClose={() => setDetailReelId(null)}
        reelId={detailReelId ?? ""}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
      />
      <AnalyzeReelModal
        open={analyzeOpen}
        onClose={() => {
          setAnalyzeOpen(false);
          setAnalyzeInitialUrl(null);
          setAnalyzeSkipApify(false);
        }}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        initialUrl={analyzeInitialUrl}
        skipApify={analyzeSkipApify}
        disabled={Boolean(disableReelAnalysis && !analyzeOpen)}
        disabledHint="An analysis is already running. Wait for it to finish or dismiss the stalled bar."
        onAnalysisJobEnqueued={(jobId) => {
          setTrackedJobType("reel_analyze_url");
          setTrackedJobId(jobId);
          setBulkExpectedTotal(null);
        }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteConfirmOpen(false);
        }}
        title={
          selectedReelIds.length === 1
            ? "Delete this reel?"
            : `Delete ${Math.min(selectedReelIds.length, BULK_MAX_DELETE)} reels?`
        }
        description={
          <>
            Removes the selected {selectedReelIds.length === 1 ? "reel" : "reels"} from this catalog and
            deletes linked Silas analysis. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        busy={deleteBusy}
        onConfirm={executeBulkDelete}
      />
    </>
  );
}

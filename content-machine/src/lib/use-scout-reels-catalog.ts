"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReelsListSortBy, ScrapedReelRow } from "@/lib/api";
import { fetchReelsListClient, type ReelsListClientQuery } from "@/lib/api-client";

export type ScoutSlice = "fresh" | "competitors" | "breakouts" | "saved";

export type ScoutSort = Extract<ReelsListSortBy, "posted_at" | "views" | "outlier_ratio">;

function sliceToQuery(slice: ScoutSlice): Pick<
  ReelsListClientQuery,
  "source" | "outlierOnly" | "favouritesOnly"
> {
  switch (slice) {
    case "fresh":
      return { source: "keyword_similarity" };
    case "competitors":
      return { source: "profile" };
    case "breakouts":
      return { outlierOnly: true };
    case "saved":
      return { favouritesOnly: true };
  }
}

export function scoutCatalogHref(slice: ScoutSlice): string {
  const p = new URLSearchParams();
  if (slice === "fresh") p.set("source", "keyword_similarity");
  else if (slice === "competitors") p.set("source", "profile");
  else if (slice === "breakouts") p.set("outliers", "1");
  else if (slice === "saved") p.set("favourites", "1");
  const q = p.toString();
  return q ? `/intelligence/reels?${q}` : "/intelligence/reels";
}

function filterRows(rows: ScrapedReelRow[], search: string): ScrapedReelRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const u = r.account_username?.toLowerCase() ?? "";
    const h = r.hook_text?.toLowerCase() ?? "";
    const c = r.caption?.toLowerCase() ?? "";
    return u.includes(q) || h.includes(q) || c.includes(q);
  });
}

export function useScoutReelsCatalog(
  clientSlug: string,
  orgSlug: string,
  opts: { pageSize: number; enabled: boolean },
) {
  const [slice, setSlice] = useState<ScoutSlice>("fresh");
  const [sort, setSort] = useState<ScoutSort>("posted_at");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ScrapedReelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [slice, sort]);

  useEffect(() => {
    if (!opts.enabled || !clientSlug.trim() || !orgSlug.trim()) {
      setRows([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchReelsListClient(clientSlug, orgSlug, {
      ...sliceToQuery(slice),
      limit: opts.pageSize,
      offset: (page - 1) * opts.pageSize,
      sortBy: sort,
      sortDir: "desc",
      includeAnalysis: true,
    }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setRows(res.data);
        setTotal(res.total);
      } else {
        setError(res.error);
        setRows([]);
        setTotal(0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clientSlug, orgSlug, slice, sort, page, opts.pageSize, opts.enabled]);

  const displayRows = useMemo(() => filterRows(rows, search), [rows, search]);
  const totalPages = Math.max(1, Math.ceil(total / opts.pageSize));

  return {
    slice,
    setSlice,
    sort,
    setSort,
    page,
    setPage,
    search,
    setSearch,
    rows: displayRows,
    total,
    totalPages,
    loading,
    error,
    pageSize: opts.pageSize,
  };
}

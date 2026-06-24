import {
  fetchAdaptPreviewReels,
  fetchDashboardCompetitorWins,
  fetchDashboardFreshNiche,
  fetchHomeSummary,
  fetchIntelligenceStats,
  getCachedServerApiContext,
  type HomeSummaryRow,
} from "@/lib/api";
import { HomeFeed } from "@/components/home/home-feed";

type DashboardSearchParams = { focusReel?: string | string[] };

const EMPTY_SUMMARY: HomeSummaryRow = {
  scout: { watching_accounts: 0, new_this_week: 0, top_opportunity_reel_id: null, working: false },
  writer: {
    drafts_ready: 0,
    in_progress: 0,
    latest_draft_session_id: null,
    last_export: null,
    working: false,
  },
  analyst: { reels_studied: 0, avg_views: null, outliers: 0, trend_pct: null, working: false },
  state: { phase: "", setup_complete: false, onboarding_step: "", is_building: false },
  momentum: { posts_made: 0, last_export: null },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const sp = searchParams ? await searchParams : {};
  const rawFocus = sp.focusReel;
  const focusReel =
    typeof rawFocus === "string" ? rawFocus.trim() : Array.isArray(rawFocus) ? String(rawFocus[0] ?? "").trim() : "";

  const { clientSlug, orgSlug } = await getCachedServerApiContext();
  const syncDisabled = !clientSlug.trim() || !orgSlug.trim();

  const [summaryRes, statsRes, freshRes, winsRes, adaptRes] = await Promise.all([
    fetchHomeSummary(),
    fetchIntelligenceStats(),
    fetchDashboardFreshNiche(),
    fetchDashboardCompetitorWins(),
    fetchAdaptPreviewReels(12),
  ]);

  const summary = summaryRes.ok && summaryRes.data ? summaryRes.data : EMPTY_SUMMARY;
  const stats = statsRes.ok ? statsRes.data : null;
  const freshReels = freshRes.ok ? freshRes.data : [];
  const winReels = winsRes.ok ? winsRes.data : [];
  const adaptReels = adaptRes.ok ? adaptRes.data : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:max-w-4xl md:px-6 md:py-8">
      <HomeFeed
        initialSummary={summary}
        freshReels={freshReels}
        winReels={winReels}
        adaptReels={adaptReels}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        disabled={syncDisabled}
        stats={stats}
        focusReelId={focusReel || undefined}
      />
    </main>
  );
}

/** Outcome-oriented copy for the Home agent-team cockpit. */
export const HOME_COPY = {
  greeting: "Good to see you",
  teamLive: "Your team is on it",

  heroDraftReadyTitle: "Today's post is ready",
  heroDraftReadySub: "Made for your voice. Review and post.",
  heroNextPostTitle: "Here's your next post",
  heroNextPostSub: "A proven style you can make yours today.",
  heroBuildingTitle: "Building your first post…",
  heroBuildingSteps: [
    "Studying your niche",
    "Reading what's working",
    "Writing your hook",
  ] as const,
  heroStartTitle: "Let's make your first post",
  heroStartSub: "Paste a reel you like, or finish setup so we can find winners for you.",

  useThis: "Use this",
  showAnother: "Show another",
  openingStudio: "Opening your studio…",
  pasteReel: "Paste a reel I like",
  finishSetup: "Finish setup",
  startNewPost: "Start a new post",

  scoutName: "Scout",
  scoutRole: "Finds proven content",
  writerName: "Writer",
  writerRole: "Drafts your posts",
  analystName: "Analyst",
  analystRole: "Learns what works for you",
  tapToSee: "Tap to see",

  scoutWorking: "Scouting…",
  writerWorking: "Writing…",
  analystWorking: "Studying…",

  freshLabel: "Fresh for you",
  freshThisWeek: "New this week",
  freshTrending: "Trending in your niche now",

  momentumPosts: (n: number) =>
    n === 1 ? "You've made 1 post with Silas" : `You've made ${n} posts with Silas`,
  momentumNone: "Your first post is one tap away",

  openStudio: "Open studio",
  yourNumbers: "Your numbers",
  makePost: "Make a post",

  scoutDrawerTitle: "What Scout found",
  scoutSliceFresh: "Fresh picks",
  scoutSliceCompetitors: "Competitors",
  scoutSliceBreakouts: "Breakouts",
  scoutSliceSaved: "Saved",
  scoutSortPosted: "Newest",
  scoutSortViews: "Most views",
  scoutSortOutlier: "Top outliers",
  scoutSearchPlaceholder: "Search hooks or @creator…",
  scoutViewCards: "Cards",
  scoutViewRows: "Rows",
  scoutShowing: (shown: number, total: number) =>
    total > 0 ? `${shown} of ${total} reels` : "No reels yet",
  scoutOpenCatalog: "Open full catalog",
  scoutEmpty:
    "Scout is still gathering reels. Finish setup or open the full catalog to browse everything.",
  writerDrawerTitle: "Your drafts",
  analystDrawerTitle: "Your performance",
  expandForMore: "Expand for more",
  collapsePanel: "Show sidebar",
  expandStudio: "Expand studio",
  collapseStudio: "Compact view",
  openFullEditor: "Full editor",

  preparing: "Preparing your draft…",
  draftReady: "Draft ready",
  reviewDraft: "Review draft",
  makeThisPost: "Make this post",
} as const;

export function formatCompactViews(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

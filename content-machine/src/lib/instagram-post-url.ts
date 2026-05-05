/** Match backend `services/instagram_post_url.py` for URL-adapt / preview lookups. */

export function canonicalInstagramPostUrl(url: string): string {
  return String(url ?? "")
    .trim()
    .split("?")[0]
    .split("#")[0]
    .replace(/\/+$/, "");
}

const IG_SHORT_CODE_RE = /instagram\.com\/(?:reel|reels|p|tv)\/([^/?#]+)/i;

export function instagramPostShortCode(url: string): string {
  const m = IG_SHORT_CODE_RE.exec(String(url ?? "").trim());
  return (m?.[1] ?? "").trim();
}

export function instagramPostUrlLookupVariants(url: string): string[] {
  const seen = new Map<string, true>();
  const base = canonicalInstagramPostUrl(url);
  if (base) seen.set(base, true);
  const sc = instagramPostShortCode(url);
  if (sc) {
    for (const path of [
      `https://www.instagram.com/reel/${sc}`,
      `https://www.instagram.com/reels/${sc}`,
      `https://www.instagram.com/p/${sc}`,
      `https://www.instagram.com/tv/${sc}`,
    ]) {
      const c = canonicalInstagramPostUrl(path);
      if (c) seen.set(c, true);
    }
  }
  return [...seen.keys()];
}

export function scrapedReelRowMatchesComposerUrl(
  row: { post_url?: string | null },
  composerUrl: string,
): boolean {
  const pu = (row.post_url ?? "").trim();
  if (!pu) return false;
  const variants = new Set(instagramPostUrlLookupVariants(composerUrl));
  return variants.has(canonicalInstagramPostUrl(pu));
}

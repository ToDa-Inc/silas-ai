/** Structured content-language + audience-geography targeting (discovery inputs). */

export type ContentLanguage = "de" | "en";

export type AudienceGeography = "worldwide" | "english_speaking" | "dach" | "custom";

export const AUDIENCE_GEOGRAPHY_OPTIONS: AudienceGeography[] = [
  "worldwide",
  "english_speaking",
  "dach",
  "custom",
];

export function normalizeContentLanguage(raw: unknown): ContentLanguage {
  return raw === "en" ? "en" : "de";
}

export function normalizeAudienceGeography(raw: unknown): AudienceGeography | "" {
  if (
    raw === "worldwide" ||
    raw === "english_speaking" ||
    raw === "dach" ||
    raw === "custom"
  ) {
    return raw;
  }
  return "";
}

export function geographyLabel(
  geo: AudienceGeography,
  note: string,
  lang: ContentLanguage,
): string {
  const n = note.trim();
  if (geo === "custom") {
    return n || (lang === "de" ? "Benutzerdefinierte Region" : "Custom region");
  }
  const labels: Record<Exclude<AudienceGeography, "custom">, { de: string; en: string }> = {
    worldwide: {
      de: "Weltweit — keine geografische Einschränkung",
      en: "Worldwide — no geographic restriction",
    },
    english_speaking: {
      de: "Englischsprachige Märkte (global)",
      en: "English-speaking markets (global)",
    },
    dach: {
      de: "DACH-Raum (Deutschland, Österreich, Schweiz)",
      en: "DACH (Germany, Austria, Switzerland)",
    },
  };
  return labels[geo][lang];
}

/** Merge structured geography into ICP (full-object replace on PUT — callers must start from current). */
export function mergeAudienceGeographyIntoIcp(
  icp: Record<string, unknown> | null | undefined,
  geography: AudienceGeography,
  note: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(icp && typeof icp === "object" ? icp : {}) };
  next.audience_geography = geography;
  if (geography === "custom") {
    next.audience_geography_note = note.trim();
  } else {
    delete next.audience_geography_note;
  }
  return next;
}

const LOCATION_HEADING_RE =
  /^([ \t]*(?:\*\*|__|#+\s*)?(?:Geografische Lage|Geographic Location|Location|Standort)\s*[:*]?\s*)(.*)$/gim;

/** Lightly patch long-form ICP location line so preview stays consistent with structured geo. */
export function patchIcpLocationText(
  text: string,
  geography: AudienceGeography,
  note: string,
  lang: ContentLanguage,
): string {
  const label = geographyLabel(geography, note, lang);
  const heading = lang === "de" ? "Geografische Lage" : "Geographic Location";
  const src = text || "";
  if (!src.trim()) {
    return `**${heading}:** ${label}`;
  }
  if (LOCATION_HEADING_RE.test(src)) {
    LOCATION_HEADING_RE.lastIndex = 0;
    return src.replace(LOCATION_HEADING_RE, `$1${label}`);
  }
  return `${src.trim()}\n\n**${heading}:** ${label}`;
}

export function patchClientContextIcpLocation(
  clientContext: Record<string, unknown> | null | undefined,
  geography: AudienceGeography,
  note: string,
  lang: ContentLanguage,
): Record<string, unknown> | null {
  if (!clientContext || typeof clientContext !== "object") return null;
  const icpSection = clientContext.icp;
  if (!icpSection || typeof icpSection !== "object") return null;
  const section = icpSection as Record<string, unknown>;
  const text = typeof section.text === "string" ? section.text : "";
  if (!text.trim()) return null;
  const nextText = patchIcpLocationText(text, geography, note, lang);
  if (nextText === text) return null;
  return {
    ...clientContext,
    icp: {
      ...section,
      text: nextText,
      updated_at: new Date().toISOString(),
    },
  };
}

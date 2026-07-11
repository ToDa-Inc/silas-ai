export type ReplicabilityTranslator = (
  key:
    | "replicabilityHighly"
    | "replicabilityStrong"
    | "replicabilityModerate"
    | "replicabilityWeak",
) => string;

const FALLBACK: Record<string, string> = {
  highly_replicable: "Highly replicable",
  strong_pattern: "Strong pattern",
  moderate: "Moderate",
  weak: "Weak",
};

/** Map DB `replicability_rating` to short UI labels. */
export function replicabilityLabel(
  r: string | null | undefined,
  t?: ReplicabilityTranslator,
): string {
  switch (r) {
    case "highly_replicable":
      return t ? t("replicabilityHighly") : FALLBACK.highly_replicable;
    case "strong_pattern":
      return t ? t("replicabilityStrong") : FALLBACK.strong_pattern;
    case "moderate":
      return t ? t("replicabilityModerate") : FALLBACK.moderate;
    case "weak":
      return t ? t("replicabilityWeak") : FALLBACK.weak;
    default:
      return r?.replace(/_/g, " ") ?? "";
  }
}

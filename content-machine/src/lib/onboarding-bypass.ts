/** Skip dashboard ↔ onboarding gating via cookie (does not mark onboarding complete). */

export const ONBOARDING_BYPASS_COOKIE = "silas_onboarding_bypass";

export const ONBOARDING_BYPASS_SKIP_HREF =
  "/api/onboarding/bypass?on=1&next=/dashboard";

export const ONBOARDING_BYPASS_RESUME_HREF =
  "/api/onboarding/bypass?on=0&next=/onboarding";

export function onboardingBypassClearHref(next = "/dashboard"): string {
  const path = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return `/api/onboarding/bypass?on=0&next=${encodeURIComponent(path)}`;
}

export function readOnboardingBypassActive(cookieValue: string | undefined | null): boolean {
  return cookieValue === "1";
}

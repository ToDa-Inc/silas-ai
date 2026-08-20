/** Dashboard routes a user may open before onboarding status is `completed`. */
export function dashboardPathAllowedDuringOnboarding(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "").trim();
  return path === "/media" || path.startsWith("/media/");
}

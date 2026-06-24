import { NextResponse } from "next/server";
import { ONBOARDING_BYPASS_COOKIE } from "@/lib/onboarding-bypass";

function safeNextPath(raw: string | null): string {
  const next = (raw ?? "/dashboard").trim();
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const on = searchParams.get("on");
  const enable = on === "1" || on === "true";
  const disable = on === "0" || on === "false";

  if (!enable && !disable) {
    return NextResponse.json(
      {
        error: "Use ?on=1 to skip onboarding gating or ?on=0 to resume normal flow.",
        skip: "/api/onboarding/bypass?on=1&next=/dashboard",
        resume: "/api/onboarding/bypass?on=0&next=/onboarding",
        test_onboarding_ui: "/onboarding",
      },
      { status: 400 },
    );
  }

  const res = NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), request.url));

  if (enable) {
    res.cookies.set(ONBOARDING_BYPASS_COOKIE, "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
      sameSite: "lax",
      httpOnly: true,
    });
    return res;
  }

  res.cookies.set(ONBOARDING_BYPASS_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}

import { connection } from "next/server";

/**
 * Quick check that Supabase env vars reach the serverless runtime (Vercel).
 * Open: GET /api/health/env — no secrets returned.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  await connection();

  const e = process.env;
  const url = e["SUPABASE_URL"] || e["NEXT_PUBLIC_SUPABASE_URL"] || "";
  const key = e["SUPABASE_ANON_KEY"] || e["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || "";
  const ok = Boolean(url.length > 8 && key.length > 10);

  const contentApi =
    e["CONTENT_API_URL"] ||
    e["NEXT_PUBLIC_CONTENT_API_URL"] ||
    e["NEXT_PUBLIC_API_URL"] ||
    "";
  const contentApiConfigured = Boolean(contentApi.length > 8 && !/127\.0\.0\.1|localhost/i.test(contentApi));

  let supabaseProject: string | null = null;
  try {
    const host = new URL(url).hostname;
    const ref = host.split(".")[0];
    supabaseProject = ref || null;
  } catch {
    supabaseProject = null;
  }

  const hints: string[] = [];
  if (!ok) {
    hints.push(
      "Add SUPABASE_URL + SUPABASE_ANON_KEY on Vercel (Production + Preview), then redeploy.",
    );
  }
  if (!contentApiConfigured) {
    hints.push(
      "Set CONTENT_API_URL to your public Railway API URL (e.g. https://….railway.app), then redeploy.",
    );
  }

  return Response.json({
    supabaseConfigured: ok,
    supabaseProject,
    contentApiConfigured,
    vercelEnv: e["VERCEL_ENV"] ?? null,
    hint: hints.length ? hints.join(" ") : null,
  });
}

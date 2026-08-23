import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveProfileApiKeyForServer } from "@/lib/supabase/service-admin";

/**
 * Fallback for browser `clientApiContext()` when the anon-key read of
 * `profiles.api_key` comes back empty (e.g. RLS not yet granting the row,
 * or the profile row lagging the workspace-creation write). Runs with the
 * service role, same as the server-rendered path in `lib/api.ts`, so it can
 * both read and (if missing) create the key instead of the request silently
 * going out with no `X-Api-Key` header.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ api_key: null as string | null }, { status: 401 });
  }

  const apiKey = await resolveProfileApiKeyForServer(user.id);
  return NextResponse.json({ api_key: apiKey });
}

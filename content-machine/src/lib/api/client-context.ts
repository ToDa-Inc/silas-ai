"use client";

import type {
  ClientCarouselTemplate,
  ClientCarouselTemplateSlide,
  ClientCarouselTemplateSlideRole,
  ClientCoverTemplate,
  ClientCta,
  ClientGenerationLibraries,
  ClientRow,
} from "@/lib/api";
import { getContentApiBase } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { resolveTenancy } from "@/lib/tenancy";
import { formatFastApiError } from "./format-error";

/** Snapshot of a ClientCta sent to the backend on session start and stored
 *  on the session. Mirrors `backend/models/generation.py::SelectedCta`. */
export type SelectedCtaPayload = ClientCta;
export type SelectedCarouselTemplatePayload = ClientCarouselTemplate;
export type SelectedCoverTemplatePayload = ClientCoverTemplate;

/** One in-flight GET — many `clientApiHeaders` calls share a single session read per burst. */
let preferredClientSlugFromSession: Promise<string | null> | null = null;

async function getPreferredClientSlugFromSession(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  if (preferredClientSlugFromSession) {
    return preferredClientSlugFromSession;
  }
  preferredClientSlugFromSession = (async () => {
    try {
      const r = await fetch("/api/session/active-client", { method: "GET", cache: "no-store" });
      if (!r.ok) return null;
      const j = (await r.json()) as { slug?: string | null };
      const s = (j.slug ?? "").trim();
      return s || null;
    } catch {
      return null;
    } finally {
      preferredClientSlugFromSession = null;
    }
  })();
  return preferredClientSlugFromSession;
}

// ---------------------------------------------------------------------------
// Session-scoped cache for clientApiContext.
// ---------------------------------------------------------------------------

type ApiContext = { headers: HeadersInit; clientSlug: string; orgSlug: string };

let _ctxCache: Promise<ApiContext> | null = null;
let _ctxExpiry = 0;
const _CTX_TTL_MS = 5 * 60_000;
let _authListenerSet = false;

function _ensureAuthListener(): void {
  if (_authListenerSet || typeof window === "undefined") return;
  _authListenerSet = true;
  createClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      _ctxCache = null;
      _ctxExpiry = 0;
      preferredClientSlugFromSession = null;
    }
  });
}

export type ClientApiHeaderOptions = {
  orgSlug?: string;
};

export async function contentApiFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    console.info(`[Content API] ${method}`, url);
  }
  return fetch(url, { ...init, cache: "no-store" });
}

export async function clientApiHeaders(opts?: ClientApiHeaderOptions): Promise<HeadersInit> {
  const { headers } = await clientApiContext(opts);
  return headers;
}

async function _resolveClientApiContext(opts?: ClientApiHeaderOptions): Promise<ApiContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const preferred = await getPreferredClientSlugFromSession();
  const tenancy = await resolveTenancy(supabase, user?.id, preferred);
  const orgSlug = opts?.orgSlug?.trim() || tenancy?.orgSlug || "";
  const clientSlug = tenancy?.clientSlug?.trim() || "";

  const h: Record<string, string> = {};
  if (orgSlug) {
    h["X-Org-Slug"] = orgSlug;
  }
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("api_key")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.api_key) {
      h["X-Api-Key"] = profile.api_key;
    }
  }
  return { headers: h, clientSlug, orgSlug };
}

export function invalidateApiContext(): void {
  _ctxCache = null;
  _ctxExpiry = 0;
  preferredClientSlugFromSession = null;
}

export async function clientApiContext(opts?: ClientApiHeaderOptions): Promise<ApiContext> {
  void opts;
  _ensureAuthListener();

  const now = Date.now();
  if (!_ctxCache || now > _ctxExpiry) {
    const p = _resolveClientApiContext();
    _ctxCache = p;
    _ctxExpiry = now + _CTX_TTL_MS;
    p.catch(() => {
      if (_ctxCache === p) _ctxCache = null;
    });
  }
  return _ctxCache;
}

/** Browser GET /clients/{slug} — workspace creator row (e.g. instagram_handle for own-reels copy). */
export async function fetchClientRowClient(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: ClientRow } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}`,
      { headers },
    );
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Invalid client response" };
    }
    return { ok: true, data: json as ClientRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** PUT replaces the entire ``client_context`` JSON column — merge with existing keys before calling. */
export async function putClientClientContext(
  clientSlug: string,
  orgSlug: string,
  client_context: Record<string, unknown>,
): Promise<{ ok: true; data: ClientRow } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(`${base}/api/v1/clients/${encodeURIComponent(clientSlug)}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ client_context }),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Save failed (${res.status})`),
      };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Invalid client response" };
    }
    return { ok: true, data: json as ClientRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** PUT replaces the full ``generation_libraries`` JSON object without touching ``client_context``. */
export async function putClientGenerationLibraries(
  clientSlug: string,
  orgSlug: string,
  generation_libraries: Record<string, unknown>,
): Promise<{ ok: true; data: ClientRow } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(`${base}/api/v1/clients/${encodeURIComponent(clientSlug)}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ generation_libraries }),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Save failed (${res.status})`),
      };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Invalid client response" };
    }
    return { ok: true, data: json as ClientRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export function normalizeCtaLibraryFromRaw(raw: unknown): ClientCta[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ClientCta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `cta_${out.length}`;
    const typeRaw = typeof o.type === "string" ? o.type : "other";
    const type =
      typeRaw === "website" ||
      typeRaw === "newsletter" ||
      typeRaw === "video" ||
      typeRaw === "lead_magnet" ||
      typeRaw === "booking"
        ? typeRaw
        : "other";
    out.push({
      id,
      label,
      type,
      destination: typeof o.destination === "string" ? o.destination : "",
      traffic_goal: typeof o.traffic_goal === "string" ? o.traffic_goal : "",
      instructions:
        typeof o.instructions === "string" && o.instructions.trim() ? o.instructions : null,
    });
  }
  return out;
}

export type ClientGenerationLibraryBundle = {
  ctaLibrary: ClientCta[];
  carouselTemplates: ClientCarouselTemplate[];
  coverTemplates: ClientCoverTemplate[];
};

export const CONTENT_DEFAULTS_UPDATED_EVENT = "content-defaults-updated";
export const CONTENT_DEFAULTS_UPDATED_AT_KEY = "content-defaults:updated-at";
export const CONTENT_DEFAULTS_PAYLOAD_KEY = "content-defaults:generation-libraries";

function objectRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

const CAROUSEL_TEMPLATE_ROLES = new Set<ClientCarouselTemplateSlideRole>([
  "cover",
  "body",
  "screenshot",
  "quote",
  "cta",
  "other",
]);

function normalizeCarouselTemplateSlide(
  raw: unknown,
  fallbackIdx: number,
): ClientCarouselTemplateSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const parsedIdx =
    typeof o.idx === "number" ? o.idx : Number.parseInt(String(o.idx ?? ""), 10);
  const idx =
    Number.isInteger(parsedIdx) && parsedIdx >= 0 && parsedIdx <= 9 ? parsedIdx : fallbackIdx;
  const roleRaw = typeof o.role === "string" ? o.role : "body";
  const role = CAROUSEL_TEMPLATE_ROLES.has(roleRaw as ClientCarouselTemplateSlideRole)
    ? (roleRaw as ClientCarouselTemplateSlideRole)
    : "body";
  const reference_image_id =
    typeof o.reference_image_id === "string" && o.reference_image_id.trim()
      ? o.reference_image_id.trim()
      : null;
  const reference_image_url =
    typeof o.reference_image_url === "string" && o.reference_image_url.trim()
      ? o.reference_image_url.trim()
      : null;
  const reference_label =
    typeof o.reference_label === "string" && o.reference_label.trim()
      ? o.reference_label.trim()
      : null;
  const instruction = typeof o.instruction === "string" ? o.instruction : "";
  return { idx, role, reference_image_id, reference_image_url, reference_label, instruction };
}

export function normalizeCarouselTemplates(raw: unknown): ClientCarouselTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientCarouselTemplate[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rawName = typeof o.name === "string" ? o.name.trim() : "";
    let id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : `carousel_template_${out.length}`;
    while (seenIds.has(id)) {
      id = `${id}_${out.length}`;
    }
    seenIds.add(id);
    const rawSlides = Array.isArray(o.slides) ? o.slides : [];
    const slides = rawSlides
      .map((slide, idx) => normalizeCarouselTemplateSlide(slide, idx))
      .filter((slide): slide is ClientCarouselTemplateSlide => slide !== null)
      .sort((a, b) => a.idx - b.idx)
      .slice(0, 10)
      .map((slide, idx) => ({ ...slide, idx }));
    if (slides.length === 0) continue;
    out.push({
      id,
      name: rawName || `Carousel template ${out.length + 1}`,
      description:
        typeof o.description === "string" && o.description.trim()
          ? o.description.trim()
          : null,
      slides,
    });
  }
  return out;
}

function normalizeCoverTemplate(raw: unknown, fallbackIdx: number): ClientCoverTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reference_image_id =
    typeof o.reference_image_id === "string" && o.reference_image_id.trim()
      ? o.reference_image_id.trim()
      : "";
  if (!reference_image_id) return null;
  const rawName = typeof o.name === "string" ? o.name.trim() : "";
  const id =
    typeof o.id === "string" && o.id.trim()
      ? o.id.trim()
      : `cover_template_${fallbackIdx}`;
  const reference_image_url =
    typeof o.reference_image_url === "string" && o.reference_image_url.trim()
      ? o.reference_image_url.trim()
      : null;
  const reference_label =
    typeof o.reference_label === "string" && o.reference_label.trim()
      ? o.reference_label.trim()
      : null;
  const instruction = typeof o.instruction === "string" ? o.instruction : "";
  return {
    id,
    name: rawName || `Cover template ${fallbackIdx + 1}`,
    reference_image_id,
    reference_image_url,
    reference_label,
    instruction,
  };
}

export function normalizeCoverTemplates(raw: unknown): ClientCoverTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientCoverTemplate[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    const norm = normalizeCoverTemplate(item, out.length);
    if (!norm) continue;
    let safeId = norm.id;
    while (seenIds.has(safeId)) {
      safeId = `${safeId}_${out.length}`;
    }
    seenIds.add(safeId);
    out.push({ ...norm, id: safeId });
  }
  return out;
}

export function normalizeGenerationLibrariesFromRow(row: {
  client_context?: unknown;
  generation_libraries?: unknown;
}): ClientGenerationLibraryBundle {
  const libsObj = objectRecord(row.generation_libraries);
  const ctxObj = objectRecord(row.client_context);
  const pick = (key: keyof ClientGenerationLibraries): unknown =>
    key in libsObj ? libsObj[key] : ctxObj[key];
  return {
    ctaLibrary: normalizeCtaLibraryFromRaw(pick("cta_library")),
    carouselTemplates: normalizeCarouselTemplates(pick("carousel_templates")),
    coverTemplates: normalizeCoverTemplates(pick("cover_thumbnail_templates")),
  };
}

export async function fetchClientGenerationLibraries(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: ClientGenerationLibraryBundle } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}`,
      { headers },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json, `Request failed (${res.status})`),
      };
    }
    return {
      ok: true,
      data: normalizeGenerationLibrariesFromRow(json as ClientRow),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export function readClientGenerationLibrariesSnapshot(): ClientGenerationLibraryBundle | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CONTENT_DEFAULTS_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ClientGenerationLibraryBundle>;
    return {
      ctaLibrary: normalizeCtaLibraryFromRaw(parsed.ctaLibrary),
      carouselTemplates: normalizeCarouselTemplates(parsed.carouselTemplates),
      coverTemplates: normalizeCoverTemplates(parsed.coverTemplates),
    };
  } catch {
    return null;
  }
}

export function broadcastClientGenerationLibrariesSnapshot(
  bundle: ClientGenerationLibraryBundle,
): void {
  if (typeof window === "undefined") return;
  const normalized: ClientGenerationLibraryBundle = {
    ctaLibrary: normalizeCtaLibraryFromRaw(bundle.ctaLibrary),
    carouselTemplates: normalizeCarouselTemplates(bundle.carouselTemplates),
    coverTemplates: normalizeCoverTemplates(bundle.coverTemplates),
  };
  window.localStorage.setItem(CONTENT_DEFAULTS_UPDATED_AT_KEY, String(Date.now()));
  window.localStorage.setItem(CONTENT_DEFAULTS_PAYLOAD_KEY, JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent<ClientGenerationLibraryBundle>(CONTENT_DEFAULTS_UPDATED_EVENT, {
      detail: normalized,
    }),
  );
}

export async function fetchClientCtaLibrary(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: ClientCta[] } | { ok: false; error: string }> {
  const bundle = await fetchClientGenerationLibraries(clientSlug, orgSlug);
  if (!bundle.ok) return bundle;
  return { ok: true, data: bundle.data.ctaLibrary };
}

export async function fetchClientCarouselTemplates(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: ClientCarouselTemplate[] } | { ok: false; error: string }> {
  const bundle = await fetchClientGenerationLibraries(clientSlug, orgSlug);
  if (!bundle.ok) return bundle;
  return { ok: true, data: bundle.data.carouselTemplates };
}

export async function fetchClientCoverTemplates(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: ClientCoverTemplate[] } | { ok: false; error: string }> {
  const bundle = await fetchClientGenerationLibraries(clientSlug, orgSlug);
  if (!bundle.ok) return bundle;
  return { ok: true, data: bundle.data.coverTemplates };
}

export { getContentApiBase };

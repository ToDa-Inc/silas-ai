/** Shared FastAPI / JSON error formatting for server and client fetch layers. */
export function formatApiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const o = json as Record<string, unknown>;
  const detail = o.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === "object" && "msg" in first) {
      const msg = (first as { msg?: unknown }).msg;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  }
  const message = o.message ?? o.error;
  if (typeof message === "string" && message.trim()) return message.trim();
  return fallback;
}

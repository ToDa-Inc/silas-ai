export function generateSessionHref(sessionId: string): string {
  return `/generate/${encodeURIComponent(sessionId)}`;
}

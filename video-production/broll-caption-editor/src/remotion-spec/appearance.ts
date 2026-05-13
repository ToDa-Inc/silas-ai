import type { VideoSpec, VideoSpecAppearance } from './schema';
import type { AppearanceFontId, ThemeTokens } from './themes';
import { fontStacksForAppearanceFontId, resolveTheme } from './themes';

function pickColor(raw: string | null | undefined): string | null {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v.length ? v : null;
}

function applyAppearanceOnTokens(base: ThemeTokens, o: VideoSpecAppearance | null | undefined): ThemeTokens {
  if (!o) return base;
  const next: ThemeTokens = { ...base };
  const cardBg = pickColor(o.cardBg ?? null);
  const cardText = pickColor(o.cardTextColor ?? null);
  const overlayText = pickColor(o.overlayTextColor ?? null);
  const overlayStroke = pickColor(o.overlayStroke ?? null);
  if (cardBg) next.cardBg = cardBg;
  if (cardText) next.cardText = cardText;
  if (overlayText) next.overlayText = overlayText;
  if (overlayStroke) next.overlayStroke = overlayStroke;
  const fid = o.fontId;
  if (fid === 'poppins' || fid === 'inter' || fid === 'playfair' || fid === 'patrick') {
    const f = fontStacksForAppearanceFontId(fid as AppearanceFontId);
    next.bodyFontStack = f.bodyFontStack;
    next.hookFontStack = f.hookFontStack;
  }
  return next;
}

/** Theme preset (``themeId``) tokens merged with optional ``spec.appearance`` overrides. */
export function resolveAppearance(spec: VideoSpec): ThemeTokens {
  const base = resolveTheme(spec);
  return applyAppearanceOnTokens(base, spec.appearance ?? null);
}

/** Global resolved theme with optional per-beat ``appearance`` overrides (blocks only). */
export function mergeLayerAppearance(
  spec: VideoSpec,
  blockAppearance?: VideoSpecAppearance | null,
): ThemeTokens {
  const base = resolveAppearance(spec);
  return applyAppearanceOnTokens(base, blockAppearance ?? null);
}

import type {
  ClientCarouselTemplateSlide,
  ClientCarouselTemplateSlideRole,
  ClientCoverTemplate,
} from "@/lib/api";
import type { ClientImageRow } from "@/lib/api-client";

export function generateCarouselTemplateId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `carousel_template_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateCoverTemplateId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `cover_template_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateCarouselTemplateSlide(
  idx: number,
  image?: ClientImageRow,
): ClientCarouselTemplateSlide {
  return {
    idx,
    role: idx === 0 ? "cover" : "body",
    reference_image_id: image?.id ?? null,
    reference_image_url: image?.file_url ?? null,
    reference_label: image?.label ?? null,
    instruction: "",
  };
}

export function generateCoverTemplateFromImage(image: ClientImageRow, name: string): ClientCoverTemplate {
  return {
    id: generateCoverTemplateId(),
    name,
    reference_image_id: image.id,
    reference_image_url: image.file_url,
    reference_label: image.label ?? null,
    instruction: "",
  };
}

export const CAROUSEL_TEMPLATE_ROLES: {
  id: ClientCarouselTemplateSlideRole;
  label: string;
}[] = [
  { id: "cover", label: "Cover" },
  { id: "body", label: "Body" },
  { id: "screenshot", label: "Screenshot" },
  { id: "quote", label: "Quote" },
  { id: "cta", label: "CTA" },
  { id: "other", label: "Other" },
];

import type { VideoSpec, VideoSpecAppearance, VideoSpecLayout } from "./video-spec";
import { DEFAULT_LAYOUT } from "./video-spec";

export type CoverEditState = {
  cropY: number;
  zoom: number;
  wash: boolean;
  templateId: VideoSpec["templateId"];
  themeId: VideoSpec["themeId"];
  textTreatment?: "bold-outline";
  layout: VideoSpecLayout;
  appearance: VideoSpecAppearance;
};

export const DEFAULT_COVER_EDIT: CoverEditState = {
  cropY: 0.5,
  zoom: 1,
  wash: false,
  templateId: "centered-pop",
  themeId: "bold-modern",
  layout: { ...DEFAULT_LAYOUT },
  appearance: {},
};

export function coverPayload(edit: CoverEditState) {
  return {
    cropY: edit.cropY,
    zoom: edit.zoom,
    wash: edit.wash,
    templateId: edit.templateId,
    themeId: edit.themeId,
    textTreatment: edit.textTreatment ?? null,
    layout: edit.layout,
    appearance: edit.appearance,
  };
}

export type StudioEditorEntryPoint = "home" | "create" | "media" | "onboarding";

export const STUDIO_ENTRY_LABELS: Record<StudioEditorEntryPoint, string> = {
  home: "Home",
  create: "Create",
  media: "Media",
  onboarding: "Setup",
};

export const STUDIO_ENTRY_HREFS: Record<StudioEditorEntryPoint, string> = {
  home: "/dashboard",
  create: "/generate",
  media: "/media",
  onboarding: "/onboarding",
};

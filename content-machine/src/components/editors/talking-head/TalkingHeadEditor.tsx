/**
 * TalkingHeadEditor — minimal flow for `talking_head` sessions.
 *
 * Talking-head doesn't go through the Remotion render pipeline — the user
 * films themself reading the script. So this editor only surfaces:
 *   1. Editable script (with regenerate + copy)
 *   2. Cover (shared CoverEditor; hidden in onboarding guided mode)
 *   3. Caption
 *   4. "What the AI is working with" (alternate hooks; hidden in guided mode)
 *
 * Pure presentational component. The host workspace still owns `scriptDraft`,
 * autosave, and the regen/copy callbacks — the `useTalkingHeadEditor` hook
 * planned for Phase B.6 will wrap that state and own it directly.
 */

import { Copy, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { SaveStatusPill } from "@/components/editor-ui";
import type { ClientImageRow, GenerationSession } from "@/lib/api-client";
import type { CoverEditState } from "@/lib/cover-edit";
import { useStudioShell } from "@/components/studio-shell-context";
import { cn } from "@/lib/cn";

import { AiContextSection } from "../shared/AiContextSection";
import { CaptionSection } from "../shared/CaptionSection";
import { RegenInline, type RegenScope } from "../shared/RegenInline";
import { CoverEditor, type CoverMode } from "../cover/CoverEditor";

type Props = {
  scriptDraft: string;
  setScriptDraft: (s: string) => void;
  contentInFlight: number;
  regenBusyScope: RegenScope | null;
  onRegenSection: (scope: RegenScope, feedback: string) => Promise<boolean>;
  copyText: (label: string, text: string) => void | Promise<void>;

  hooks: Array<{ text?: string }>;
  coverOptions: string[];
  coverRegenBusy: boolean;
  onRegenerateCovers: () => void;
  images: ClientImageRow[];
  thumbnailUrl: string | null;
  thumbnailBusy: boolean;
  coverText: string;
  coverImageId: string;
  selectedCoverTemplate: GenerationSession["selected_cover_template"] | null;
  coverEdit: CoverEditState;
  coverSpecInFlight: number;
  coverMode: CoverMode;
  onCoverModeChange: (m: CoverMode) => void;
  onCoverTextChange: (s: string) => void;
  onCoverEditChange: (next: CoverEditState) => void;
  onSelectCoverImage: (id: string) => void;
  onGenerateThumbnail: () => void;
  onComposeCoverFromImage: () => void;

  captionBody: string;
  hashtags: string[];
  captionFull: string;
  embedded?: boolean;
  showCover?: boolean;
  showAiContext?: boolean;
  guidedMode?: boolean;
  onGuidedComplete?: () => void;
  generateError?: string | null;
};

export function TalkingHeadEditor({
  scriptDraft,
  setScriptDraft,
  contentInFlight,
  regenBusyScope,
  onRegenSection,
  copyText,

  hooks,
  coverOptions,
  coverRegenBusy,
  onRegenerateCovers,
  images,
  thumbnailUrl,
  thumbnailBusy,
  coverText,
  coverImageId,
  selectedCoverTemplate,
  coverEdit,
  coverSpecInFlight,
  coverMode,
  onCoverModeChange,
  onCoverTextChange,
  onCoverEditChange,
  onSelectCoverImage,
  onGenerateThumbnail,
  onComposeCoverFromImage,

  captionBody,
  hashtags,
  captionFull,
  embedded = false,
  showCover = true,
  showAiContext = true,
  guidedMode = false,
  onGuidedComplete,
  generateError = null,
}: Props) {
  const t = useTranslations("onboarding");
  const { expanded: studioExpanded } = useStudioShell();
  const scriptRows = Math.min(48, Math.max(14, scriptDraft.split("\n").length + 2));

  return (
    <div className="space-y-4">
      {guidedMode && onGuidedComplete ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-950 dark:text-amber-50">{t("talkingHeadGuidedTitle")}</p>
          <p className="mt-1 text-xs text-amber-950 dark:text-amber-50">{t("talkingHeadGuidedHint")}</p>
        </div>
      ) : null}

      <div className="glass rounded-2xl border border-app-divider/80 p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Video className="h-4 w-4 text-amber-500" />
          <h2 className="flex-1 text-sm font-semibold text-app-fg">Script</h2>
          <RegenInline
            scope="script"
            busy={regenBusyScope === "script"}
            onRegen={async (s, fb) => onRegenSection(s, fb)}
            placeholder="Tighter, more direct, add a story…"
          />
          <button
            type="button"
            onClick={() => void copyText("script", scriptDraft)}
            className="inline-flex items-center gap-1 rounded-lg bg-app-icon-btn-bg px-2.5 py-1 text-[11px] font-bold text-app-icon-btn-fg"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-app-fg-muted">
          Talking-head format — film yourself reading this script. Edit freely; markdown headings
          (##&nbsp;Hook, ##&nbsp;Build-up, ##&nbsp;Reframe, ##&nbsp;Clarity, ##&nbsp;CTA) match the content brief.
        </p>
        <textarea
          value={scriptDraft}
          onChange={(e) => setScriptDraft(e.target.value)}
          rows={scriptRows}
          className={cn(
            "glass-inset w-full resize-y rounded-xl px-4 py-3 font-mono text-sm leading-relaxed text-app-fg placeholder:text-app-fg-subtle focus:outline-none focus:ring-2 focus:ring-amber-500/35",
            embedded &&
              (studioExpanded
                ? "min-h-[min(62vh,680px)]"
                : "min-h-[min(46vh,480px)]"),
          )}
          placeholder="## Hook&#10;…&#10;&#10;## Build-up&#10;…&#10;&#10;## Reframe&#10;…"
        />
        <div className="mt-3 flex items-center gap-2 text-[11px] text-app-fg-subtle">
          <SaveStatusPill inFlight={contentInFlight} />
          <span className="opacity-70">Changes save automatically.</span>
        </div>
      </div>

      {showCover ? (
        <CoverEditor
          hooks={hooks}
          coverOptions={coverOptions}
          coverRegenBusy={coverRegenBusy}
          onRegenerateCovers={onRegenerateCovers}
          images={images}
          thumbnailUrl={thumbnailUrl}
          thumbnailBusy={thumbnailBusy}
          coverText={coverText}
          selectedImageId={coverImageId}
          selectedCoverTemplate={selectedCoverTemplate}
          coverEdit={coverEdit}
          coverSpecInFlight={coverSpecInFlight}
          mode={coverMode}
          onModeChange={onCoverModeChange}
          onCoverTextChange={onCoverTextChange}
          onCoverEditChange={onCoverEditChange}
          onSelectImage={onSelectCoverImage}
          onGenerateAi={onGenerateThumbnail}
          onComposeFromImage={onComposeCoverFromImage}
          generateError={generateError}
          step={2}
          embedded={embedded}
        />
      ) : null}

      <CaptionSection
        caption={captionBody}
        hashtags={hashtags}
        onCopy={() => void copyText("caption + hashtags", captionFull)}
        regenInline={
          <RegenInline
            scope="caption"
            busy={regenBusyScope === "caption"}
            onRegen={async (s, fb) => onRegenSection(s, fb)}
            placeholder="Different angle, shorter, …"
          />
        }
      />

      {showAiContext ? (
        <AiContextSection
          hooks={hooks}
          regenHooks={(fb) => onRegenSection("hooks", fb)}
          busy={regenBusyScope === "hooks"}
        />
      ) : null}

      {guidedMode && onGuidedComplete ? (
        <button
          type="button"
          disabled={!scriptDraft.trim()}
          onClick={onGuidedComplete}
          className="flex w-full items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("talkingHeadGuidedContinue")}
        </button>
      ) : null}
    </div>
  );
}

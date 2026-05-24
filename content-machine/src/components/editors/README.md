# Editors

Format-specific editor surfaces for the `/generate` Create flow.

The host (`components/video-create-workspace.tsx`) is the dispatcher:
talking_head → `<TalkingHeadEditor>`, carousel → `<CarouselEditor>`,
cover/text_overlay/b_roll_reel → uses `<CoverEditor>` for the cover step
and still renders the text_overlay/b_roll_reel Steps 1–4 inline (see
`VideoEditor.tsx` for why).

## Current layout

```
editors/
  shared/                       ← presentation primitives + helpers
    StepHeader.tsx              ✅ extracted
    CaptionSection.tsx          ✅ extracted
    RegenInline.tsx             ✅ extracted (replaces old global Refine panel)
    AiContextSection.tsx        ✅ extracted (alternate hooks accordion)
    ClientImagesPicker.tsx      ✅ extracted (image grid/strip)
    BrollLibrarySection.tsx     ✅ extracted (b-roll clip grid/strip)
    style-helpers.tsx           ✅ extracted (Look themes, glyphs, chip styles, font helpers)
    StudioShell.tsx             ⏳ Phase C — 2-pane shell (preview + inspector)
    useEditorSelection.ts       ⏳ Phase C — selection state machine
    InspectorForSelection.tsx   ⏳ Phase C — per-selection inspector renderer
    EditorCommandPalette.tsx    ⏳ Phase D — ⌘K palette wrapper
    actionRegistry.ts           ⏳ Phase D — typed action registry
  cover/                        ← cover/thumbnail editor
    CoverTextLayerEditor.tsx    ✅ extracted (drag-to-position headline canvas)
    CoverEditor.tsx             ✅ extracted (Content / Style / Image tabs)
  carousel/                     ← carousel slide editor
    carousel-helpers.ts         ✅ extracted (constants, font stacks, text-box defaults, clamps,
                                    clientImageIdForSlide)
    CarouselTextLayerEditor.tsx ✅ extracted (drag-to-position text overlay canvas)
    CarouselEditor.tsx          ✅ extracted (Text / Background / Slide tabs + ZIP export)
  video/                        ← reel editor (text_overlay + b_roll_reel)
    BackgroundPicker.tsx        ✅ extracted (AI / Client photo / Stock clip in one place)
    VideoEditor.tsx             📝 placeholder — see comment, full impl is Phase C
    useVideoEditor.ts           📝 stub interface — see comment, hook ships in Phase C
  talking-head/                 ← script + cover only (no render pipeline)
    TalkingHeadEditor.tsx       ✅ extracted (script card + CoverEditor + Caption + AiContext)
```

## Workspace size journey

| Phase | Lines in `video-create-workspace.tsx` | Δ |
|---|---|---|
| Before Phase B | 6,458 | — |
| After B.1 (CarouselTextLayerEditor) | 6,228 | −230 |
| After B.3 (CoverEditor) | 5,219 | −1,009 |
| After B.2 (TalkingHeadEditor) | 5,171 | −48 |
| After B.4 (CarouselEditor) | 4,390 | −781 |
| After B.5 (BrollLibrarySection + VideoEditor skeleton) | ~4,229 | −161 |

About 2,200 lines of cohesive presentational code has moved into per-format
modules. What remains in `video-create-workspace.tsx`:

- Session bootstrap + autosave plumbing for all formats (~1,300 lines of
  callbacks, refs, polling)
- The text_overlay / b_roll_reel render path JSX (~1,400 lines)
- Format dispatch (~30 lines)

## Why the video render path is still inline

Mechanical extraction of the text_overlay/b_roll_reel JSX into
`VideoEditor.tsx` was deferred for honest reasons:

1. The JSX threads ~80 props (state + callbacks). Wrapping it without
   moving the state too is relocation, not refactoring — it would obscure
   the coupling rather than reduce it.
2. Phase C replaces the step-based JSX with a Studio shell (sticky preview
   + contextual inspector + ⌘K palette). The current 4-step layout will
   not survive that change. Spending time wrapping doomed JSX is busywork.

The proper migration path is: Phase C builds `<StudioShell>` and the
inspector pattern, Phase D adds ⌘K. At that point, `useVideoEditor` owns
the video state and `VideoEditor` becomes a thin shell composer (see the
header comments in `editors/video/VideoEditor.tsx` and `useVideoEditor.ts`
for the target shape).

## What's already shared

Lower-level UI primitives live one level up so they stay reusable outside
editor surfaces (e.g. settings panels, intelligence views):

- `@/components/editor-ui` — `EditorShell`, `SegmentedTabs`, `AlignmentPad`,
  `ScopeToggle`, `SaveStatusPill`, `HelpHint`, `ControlGroupHeader`,
  `InheritanceHint`, `ScopeLockedHint`, `CarouselEditableEmptyState`.
- `@/components/layout-slider` — `LayoutSlider` (dual-callback range slider).
- `@/components/ui/app-select` — `AppSelect`.
- `@/components/post-preview-modal` — `PostPreviewModal`.
- `@/components/video-spec-preview` — `VideoSpecPreview` (Remotion `<Player>`).
- `@/components/undo-pill` — undo/redo status pill (workspace-owned stack today).

## Conventions

- Sub-components are **pure props in / events out**. They do not call the
  API client directly; the host owns IO + autosave.
- Strings shown to users go through `HelpHint` for tooltips when the term
  is non-obvious (Hook, Block, Beat, Apply to, Darken background, etc.).
- Save state is surfaced via a single `<SaveStatusPill inFlight={n} />`
  next to the section header — no per-button "Saving…" labels.
- Tooltips (`HelpHint`) open ABOVE the trigger by default (`bottom-full`)
  with a solid background so they never cover the control they describe.

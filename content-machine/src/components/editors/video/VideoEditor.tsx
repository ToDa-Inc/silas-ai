/**
 * VideoEditor — Studio editor for `text_overlay` and `b_roll_reel` formats.
 *
 * Status: PLACEHOLDER. Intentional.
 *
 * Today the video pipeline still renders inline inside `video-create-workspace.tsx`
 * (4-step layout: Text → Visual & render → Cover → Output). Phase B extracted
 * every leaf (`StepHeader`, `CaptionSection`, `CoverEditor`, `CarouselEditor`,
 * `CarouselTextLayerEditor`, `CoverTextLayerEditor`, `BackgroundPicker`,
 * `BrollLibrarySection`, `ClientImagesPicker`, `RegenInline`, `AiContextSection`,
 * shared style/carousel helpers) so the workspace orchestrator is far
 * lighter — but the text_overlay/b_roll_reel render path itself stays
 * inlined because mechanically wrapping it in a god-props component
 * (`Props = ~80 callbacks + state`) would be relocation, not refactoring.
 *
 * Phase C is going to REPLACE the step-based JSX with a 2-pane Studio shell
 * (sticky preview + contextual inspector + ⌘K palette). When that lands,
 * this file becomes the actual entry point for the video editor:
 *
 *   export function VideoEditor(props: { clientSlug; orgSlug; sessionId }) {
 *     const editor = useVideoEditor({ clientSlug, orgSlug, sessionId });
 *     return (
 *       <StudioShell
 *         topTabs={<FormatTabs current="reel" tabs={["reel", "cover"]} />}
 *         topStatus={<SaveStatusPill inFlight={editor.inFlight} />}
 *         topActions={<><PreviewPostButton/> <ExportButton/></>}
 *         preview={<VideoSpecPreview spec={editor.spec} onSelect={editor.setSelection} />}
 *         timeline={<TimelineStrip ... />}
 *         inspector={<InspectorForSelection selection={editor.selection} editor={editor} />}
 *       />
 *     );
 *   }
 *
 * Until Phase C: callers should keep importing `VideoCreateWorkspace` from
 * `@/components/video-create-workspace`. That file dispatches to format
 * editors (CarouselEditor, CoverEditor, TalkingHeadEditor) but still owns
 * the text_overlay/b_roll_reel pipeline inline.
 */

export const VIDEO_EDITOR_PLACEHOLDER = true;

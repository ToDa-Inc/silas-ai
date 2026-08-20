# Voice-first onboarding — spec

Status: draft for review (no code yet)
Owner context: replaces the typed "quiz" + "source" steps with a single voice recording that
answers 10-12 questions in one take, transcribes it, and runs it through your four real prompts
(`docs/onboarding_process/*.md`) to produce ICP, Brand Map, Storyboard, and Communication
Guideline — automatically, instead of the manual copy/paste/run process described in the call.

---

## 1. Why (recap from the meeting)

- Typed onboarding forms don't get filled in with enough depth — people won't type a 10-minute
  answer, free users have zero incentive to, paid users are lazy and blame the product later.
- Talking is much lower friction than typing and produces far richer material for the four
  documents.
- The four documents (ICP, Brand Map, Storyboard, Communication Guideline) are the real product
  value — "context beats model," most prospects have fragments of this in scattered notes, never
  as 4 usable documents.
- Decision from the call: **one continuous voice recording** answering ~10-12 questions shown one
  page, not 10 separate recordings and not the original 40-question version.
- Free tier: preview the 4 documents, no copy/download, paywall to unlock. Paid tier: full access.

## 2. What already exists (don't rebuild this)

| Piece | Where |
|---|---|
| Onboarding step machine (`workspace → quiz → source → strategy_docs → pipeline → ...`) | `content-machine/src/lib/onboarding-ui.ts`, `content-machine/src/app/onboarding/onboarding-wizard.tsx` |
| Typed quiz + source steps that build a `transcript` string and call generation | `onboarding-wizard.tsx:327-425` |
| Condensed 5-section generator (1 OpenRouter call → icp/brand_map/story_board/communication_guideline/offer_documentation) | `backend/services/client_context_generate.py` |
| `POST /api/v1/clients/{slug}/context/generate` (draft, non-persisting) | `backend/routers/context.py:124-152` |
| File upload → Supabase Storage pattern (PDF/DOCX today) | `backend/routers/context.py:63-121`, bucket `client-context` |
| Background job pattern for "fetch external data → call OpenRouter → write onboarding state" | `backend/jobs/onboarding_ig_prefill.py` + `backend/services/onboarding_ig_prefill.py` |
| Job dispatch table | `backend/worker.py:126-165` (`_process_job_sync`) |
| Onboarding state columns (`quiz_answers`, `ig_prefill`, `job_ids`, `pipeline_progress`) | `backend/sql/phase30_onboarding.sql`, `phase31_onboarding_ig_prefill.sql` |
| Preview cards for the 4/5 documents | `onboarding-wizard.tsx:1022-1059` (`strategy_docs` step) |
| **The real 4 prompts** (deep, `{{ONBOARDING_QUIZ}}` + `{{TRANSCRIPT}}` templated, one call per document) | `docs/onboarding_process/icp.md`, `brand_map.md`, `stroyboard.md`, `communication_guidelines.md` |

Net-new work is: **voice capture UI, transcription, wiring the real 4 prompts as 4 separate
generation calls, and preview-only gating.** Everything else is extension of existing patterns.

## 3. Transcription: OpenRouter audio endpoint (no new provider needed)

Correcting my earlier assumption: OpenRouter now exposes a dedicated STT endpoint that hosts
Chirp 3 directly, so this needs **zero new infrastructure** — it reuses `OPENROUTER_API_KEY`,
which is already configured.

```
POST https://openrouter.ai/api/v1/audio/transcriptions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json

{
  "model": "google/chirp-3",
  "input_audio": { "data": "<base64 wav/webm/m4a>", "format": "webm" },
  "language": "de"   // optional hint; omit to auto-detect
}
```

- Cost: $0.016/min — a 3-minute onboarding recording costs ~$0.05. Trivial at any volume you'd
  see pre-paid-conversion.
- `model` is swappable to `openai/whisper-1` or `openai/gpt-4o-transcribe` (also on OpenRouter) if
  Chirp's German accuracy underwhelms in testing — same call shape, one string change.
- New thin wrapper `backend/services/openrouter_transcribe.py::transcribe_audio()` mirroring the
  existing `openrouter_post_chat_completions` retry/backoff pattern in `services/openrouter.py`.

### 3a. Exact request parameters we need

`POST /api/v1/audio/transcriptions` (JSON body, not multipart — see limits below):

| Param | Value we send | Why |
|---|---|---|
| `model` | `"google/chirp-3"` | Fixed, configurable via a new `openrouter_transcribe_model` setting (same pattern as `openrouter_reel_analyze_model`) so it's a one-line swap to `openai/whisper-1` etc. |
| `input_audio.data` | base64 of the raw audio bytes | Required. Encode server-side after downloading the blob from Supabase Storage — don't base64 in the browser, just upload the raw `Blob`. |
| `input_audio.format` | `"webm"` (or `"mp4"` for Safari — see below) | Must match the actual container the browser produced. |
| `language` | client's known language if set on `clients.language` (e.g. `"de"`), otherwise **omitted** to auto-detect | Chirp 3 auto-detects across 100+ languages; only pass a hint when we already know it, since some onboarding calls may reasonably happen in English even for a German-market client. |
| `temperature` | `0` | Deterministic transcription — we don't want creative variation on a "what did they actually say" task. |
| `provider` | omitted | Chirp 3 has exactly one provider on OpenRouter today, no routing choice to make. |

That's the full parameter surface — no `prompt`, `timestamp_granularities`, diarization, or
confidence scores are available on this endpoint (those fields exist for OpenAI-compatible
multipart requests but are explicitly documented as **ignored** by the backing providers). Two
real constraints this creates, both handled below:

1. **No word/segment timestamps → no automatic per-question splitting** from the STT call itself.
   We solve this with a second, cheap LLM pass (§5a), not from the transcription endpoint.
2. **60-second-per-request upstream timeout.** A 10-question voice memo can easily run 3-6
   minutes. Recommend chunking: split the audio into ~90s segments (silence-aware if easy,
   fixed-length is fine for v1) before sending to the endpoint, transcribe each chunk, and
   concatenate. This runs inside the background job, so it's invisible to the user either way —
   just needs `ffmpeg` (already reachable via the video-production tooling in this repo) or
   `pydub` for the split.
3. **Format matching matters.** Browser `MediaRecorder` typically produces `audio/webm;codecs=opus`
   on Chrome/Firefox/Edge, and `audio/mp4` on Safari — detect `MediaRecorder.mimeType` client-side
   and pass the matching `format` through to the upload endpoint so the job sends the right value.

## 4. The 10 (or 12) questions

One page, one recording, questions shown as a scrollable prompt list while recording continues.
Each question is tagged with which document(s) it primarily feeds — this tag list becomes the
`{{ONBOARDING_QUIZ}}` block injected into each of the 4 real prompts, so the model always has the
original question context, not just a raw answer blob.

| # | Question | Feeds |
|---|---|---|
| 1 | Your name and what your business/brand is | all |
| 2 | Who is your ideal client — age, situation, what they struggle with | ICP |
| 3 | What do they want most / what result are they chasing | ICP |
| 4 | Your main offer(s) and price point | Brand Map |
| 5 | What makes you different from others in your space | Brand Map |
| 6 | Your brand values / personality (serious, funny, bold, calm...) | Brand Map, Communication Guideline |
| 7 | Your origin story — why you started this | Storyboard |
| 8 | A specific client win or transformation you're proud of | Storyboard |
| 9 | Words/phrases you always use, or ones you hate | Communication Guideline |
| 10 | Your content goals (sales, authority, leads, webinar signups...) | Brand Map |
| 11 *(paid bonus)* | 1-3 competitors/creators you admire or compete with | ICP, Brand Map |
| 12 *(paid bonus)* | Something people always misunderstand or ask about you | ICP, Communication Guideline |

Free tier asks 1-10. Paid tier (or "answer 2 more for a sharper result") unlocks 11-12.

## 5. Target UX flow

1. **Workspace step** (unchanged) — name, workspace name.
2. **New "Record" step** replaces `quiz` + `source`:
   - Big record button. Press once → `MediaRecorder` starts, all 10 questions shown as a
     scrollable list (current question auto-highlighted based on elapsed time is a nice-to-have,
     not required for v1).
   - Press stop → upload the audio blob.
   - **"Type instead" fallback link** at all times (per your answer to keep typed input as an
     alternative) — opens the existing typed quiz/source fields as a fallback for mic-permission
     issues, noisy environments, or people who just prefer typing. Both paths converge on the same
     `transcript` string + `quiz_answers` shape so downstream generation code doesn't fork.
   - After upload: "Transcribing..." → show the transcript **editable and well-formatted** (see
     §5a) → Confirm.

### 5a. Review UI: per-question cards, not a text wall

The STT endpoint returns one flat `text` string with no timestamps or per-question boundaries
(§3a), so a single continuous voice memo can't be split mechanically. To still give a "good view
and syntax" review experience instead of dumping a wall of text:

1. After transcription, run one extra fast/cheap LLM call —
   `services/onboarding_voice_structure.py::split_transcript_by_question()` — that takes the raw
   transcript + the 10-12 question list and returns strict JSON
   `{ "1": "answer text for question 1", "2": "...", ... }`. Use a small, fast model for this
   (`google/gemini-3.5-flash` at low `max_tokens`, or the existing
   `openrouter_model_fallback` if it's cheaper) — it's a mechanical re-segmentation task, not
   generation, so don't spend a big model on it.
2. Render each question as its own card: question text as a label, the matched answer as an
   editable `<textarea>` below it (reuses `onboardingTextareaClass` styling already defined in
   `onboarding-ui.ts`), with a small "didn't say anything for this one?" empty state instead of an
   empty box.
3. Keep a collapsed "view full raw transcript" toggle for power users / debugging, but the
   per-question cards are the primary, default view.
4. On Confirm, the **edited per-question text is rejoined** (question header + answer, same shape
   `buildSourceTranscript()` already produces at `onboarding-wizard.tsx:342-355`) into the single
   transcript string that feeds the four real prompts — so the splitting step only affects the
   *review UI*, not what the generation prompts receive (they still get full natural-flow context,
   which matches how the prompts are written).
5. Known limitation to set expectations on: since there's no confidence scoring on this endpoint,
   we can't highlight "uncertain" words the way some transcription UIs do — the per-question
   segmentation is the main accuracy/readability lever we have, and it should catch most
   STT-garbled sections since the user is prompted to check answers one at a time rather than
   skimming one long block.
3. **Generation (background job, async)** — confirming kicks off `onboarding_voice_transcribe`
   (see §6), which already includes transcription if not done client-side-polling; state moves to
   `strategy_docs` step showing a progress state ("Building your ICP... Brand Map... Storyboard...
   Communication Guideline...") reusing the existing pipeline-progress UI pattern from
   `onboarding-pipeline-progress.tsx`.
4. **Strategy docs preview** (existing step, extended) — 4 cards. Free plan: text is
   visually blurred/truncated with a "Buy to unlock full access" CTA; paid plan: full text +
   copy/export. No new document viewer needed, just a gating wrapper on the existing cards.
5. Rest of the wizard (`pipeline`, `reel_review`, ...) unchanged.

## 6. Backend changes

**New migration `backend/sql/phase32_onboarding_voice.sql`:**
```sql
ALTER TABLE client_onboarding_state
  ADD COLUMN IF NOT EXISTS voice_transcript jsonb NOT NULL DEFAULT '{}'::jsonb;
  -- { status, audio_storage_path, raw_transcript, edited_transcript, language, duration_s, at, error }

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS onboarding_questions jsonb;
  -- snapshot of the question set + which-doc-mapping used, for prompt reproducibility/audit
```
(`client_context` jsonb on `clients` already has the slot for the 4 generated docs — no schema
change needed there, just start writing real per-section prompt output into it.)

**New endpoint** `POST /api/v1/clients/{slug}/onboarding/voice/upload` (mirrors
`context.py:63-121`'s storage-upload pattern, new bucket or reuse `client-context` bucket, new
`onboarding-audio/{client_id}/{uuid}.webm` path). Enqueues `onboarding_voice_transcribe` job,
returns `job_id` for the frontend to poll (same shape as `PipelineStartOut`).

**New job** `backend/jobs/onboarding_voice_transcribe.py` (mirrors
`onboarding_ig_prefill.py` structure):
1. Download audio from storage.
2. Call `openrouter_transcribe.transcribe_audio()` (§3).
3. Write `voice_transcript.raw_transcript` to `client_onboarding_state`, status `transcribed`
   (frontend polls this to show the editable-review sub-step before generation continues — OR,
   simpler for v1: skip a stop-and-review round trip and only allow edits after the fact from the
   `strategy_docs` step's "regenerate" action; **flagging this as a v1 scope decision**, see §9).
4. Run the 4 real prompts from `docs/onboarding_process/*.md`, substituting `{{TRANSCRIPT}}` and
   `{{ONBOARDING_QUIZ}}`, as 4 separate OpenRouter calls (new function
   `services/client_context_generate.py::generate_sections_from_real_prompts()`, replacing the
   current condensed single-call `generate_sections_from_transcript()` — confirmed: replace
   everywhere, not just for voice, per your answer).
   - **Model: `google/gemini-3.5-flash`**, confirmed. This is a real, current OpenRouter model
     (verified — released May 2026, $1.50/$9 per 1M tokens, 1M context, near-Pro reasoning at
     Flash cost/speed) and newer than the repo's current default
     (`google/gemini-3-flash-preview` in `backend/core/config.py`). Adding it as its own setting
     rather than overloading `openrouter_model`:
     ```python
     # backend/core/config.py — new field, same pattern as openrouter_reel_analyze_model
     openrouter_onboarding_model: str = Field(
         default="google/gemini-3.5-flash",
         validation_alias=AliasChoices("OPENROUTER_ONBOARDING_MODEL"),
         description="OpenRouter model id for the four onboarding brain documents (ICP, Brand Map, Storyboard, Communication Guideline).",
     )
     ```
     Keeping it as a separate setting (rather than changing the global `openrouter_model` default)
     avoids touching every other call site (reel analysis, DNA compile, etc.) that isn't part of
     this change. `openrouter_model_fallback` behavior stays available since
     `generate_sections_from_real_prompts()` will still call through
     `openrouter_post_chat_completions()` with `enable_model_fallback=True`.
   - These 4 calls run **sequentially or in parallel** inside the job — recommend parallel
     (`asyncio.gather` / thread pool of 4) since they're independent, cutting total generation time
     ~4x versus sequential, and the existing `worker_concurrency` + OpenRouter rate limiter
     (`services/openrouter_limiter.py`) already protects against burst overload.
5. Persist each section onto `clients.client_context` (same shape `putClientClientContext`
   already writes: `{ text, source: "generated", file: null, updated_at }`).
6. Update `client_onboarding_state.voice_transcript.status = "ready"`, advance
   `current_step = "strategy_docs"`.

**Worker dispatch**: add one `elif jt == "onboarding_voice_transcribe":` line in
`backend/worker.py::_process_job_sync`.

**Prompt loading**: load the 4 `.md` files from `docs/onboarding_process/` at import time (or copy
them into `backend/prompts/` as the canonical runtime location — recommend moving them into
`backend/prompts/` so they're deployed with the backend rather than depending on `docs/` at
runtime). Strip the German copyright/watermark footer lines before use.

## 7. Frontend changes

- New component `content-machine/src/components/onboarding/onboarding-voice-recorder.tsx`:
  `MediaRecorder` wrapper, mic-permission handling, elapsed-time display, pause/resume, re-record,
  upload with progress.
- `onboarding-wizard.tsx`: replace the `quiz` + `source` step bodies with the recorder + "type
  instead" toggle; keep the existing typed fields as the fallback path (already built at
  `:629-829`), reusing the same `advance()`/`quiz_answers` write.
- Add a lightweight polling hook (same pattern as the existing `ig_prefill` poll at
  `onboarding-wizard.tsx:200-245`) for `voice_transcript.status`.
- `strategy_docs` step: wrap each of the 4 preview cards with a gate component that checks
  `organizations.plan !== "free"` (or a simpler `clients.is_paid` flag if you'd rather not couple
  this to the `organizations.plan` enum yet) — blur text past ~3 lines, disable copy/select, show
  upgrade CTA.

## 8. Gating scope (per your answer: preview-only, no billing wiring yet)

- Purely UI/API-level: block the *download/copy/full-text* of the 4 documents for free-plan
  clients; no Stripe, no payment flow in this pass.
- Needs one backend guard: whatever "export" or "full context" read endpoint exists needs to
  return truncated text (or a `locked: true` flag + let frontend blur) for free-plan callers. Since
  no such export endpoint exists yet, this can be as simple as the `GET client_context` response
  including a `locked` boolean the frontend reacts to — cheap now, safe to tighten later once real
  billing exists.

## 9. Decisions — confirmed

1. **Review before generate**: confirmed. Stop recording → transcribe → show editable,
   per-question review UI (§5a) → user confirms → *then* the 4-document generation job runs. Two
   separate jobs/calls (`onboarding_voice_transcribe` for transcription+structuring,
   then a second trigger for the 4-prompt generation on Confirm), not one blind pipeline — cheaper
   to fix a bad transcript before spending 4 LLM calls on it.
2. **Real 4 prompts everywhere**: confirmed. `generate_sections_from_real_prompts()` (using
   `docs/onboarding_process/*.md`, model `google/gemini-3.5-flash`) fully replaces
   `generate_sections_from_transcript()`, used for both the voice path and the typed fallback path,
   since both converge on the same transcript string (§2).

Remaining smaller calls I'll make by default unless you object:
- **Audio retention**: keep the raw recording in Supabase Storage after transcription (cheap,
  useful later for tone/pacing analysis), same bucket RLS as other client-context files.
- **Language handling**: Chirp 3 auto-detects; each of the 4 prompts is instructed to output in
  the same language as the transcript, matching current behavior.
- **Chunking**: implement the ~90s audio chunking (§3a) from the start rather than retrofitting it
  after a real recording times out in production.

## 10. Build order

1. `backend/core/config.py`: add `openrouter_transcribe_model` (`google/chirp-3`) and
   `openrouter_onboarding_model` (`google/gemini-3.5-flash`) settings.
2. `services/openrouter_transcribe.py::transcribe_audio()` — chunked STT call per §3a, + a small
   manual test script (record a German sample, sanity-check output).
3. Move/adapt the 4 real prompts into `backend/prompts/`, build
   `generate_sections_from_real_prompts()` (parallel 4 calls), unit-test against a saved sample
   transcript.
4. `services/onboarding_voice_structure.py::split_transcript_by_question()` for the review UI
   (§5a).
5. `phase32_onboarding_voice.sql` migration + `onboarding_voice_transcribe` job + worker dispatch
   + upload endpoint + a second "generate" trigger endpoint for after review-confirm.
6. Frontend recorder component + per-question review cards + wizard step swap (voice primary,
   typed fallback).
7. Preview gating on `strategy_docs` cards.
8. End-to-end test: record → transcribe → per-question review/edit → confirm → generate → preview
   (blurred as free, unblurred as paid) → continue to `pipeline` step unchanged.

---

Both open decisions are resolved — starting on step 1 now.

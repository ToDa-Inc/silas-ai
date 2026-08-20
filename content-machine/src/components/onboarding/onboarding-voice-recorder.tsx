"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileAudio, FileText, Loader2, Mic, Square, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { OnboardingVoiceLevelMeter } from "@/components/onboarding/onboarding-voice-level-meter";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  audioFormatFromFile,
  formatRecordingTime,
  MAX_VOICE_UPLOAD_BYTES,
  measureBlobAudioSeconds,
  ONBOARDING_VOICE_QUESTIONS,
  pickRecorderMimeType,
  questionLabel,
  type OnboardingLang,
} from "@/lib/onboarding-voice-questions";
import { onboardingTextareaClass } from "@/lib/onboarding-ui";
import { cn } from "@/lib/cn";

type InputMode = "record" | "upload" | "text";

type Props = {
  disabled?: boolean;
  language?: OnboardingLang;
  onRecorded: (blob: Blob, format: string) => void | Promise<void>;
  onSubmitText: (text: string) => void | Promise<void>;
};

export function OnboardingVoiceRecorder({
  disabled,
  language = "de",
  onRecorded,
  onSubmitText,
}: Props) {
  const t = useTranslations("onboarding");
  const total = ONBOARDING_VOICE_QUESTIONS.length;
  const [inputMode, setInputMode] = useState<InputMode>("record");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [selectedAudioName, setSelectedAudioName] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const mimeTypeRef = useRef("audio/webm");
  const formatRef = useRef("webm");
  const finalizingRef = useRef(false);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const currentQuestion = ONBOARDING_VOICE_QUESTIONS[questionIndex];
  const isLastQuestion = questionIndex >= total - 1;
  const busy = uploading || disabled;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setMeterStream(null);
  }, []);

  const failRecording = useCallback(
    (message: string) => {
      clearTimer();
      setRecording(false);
      setUploading(false);
      setError(message);
      stopTracks();
      recorderRef.current = null;
      chunksRef.current = [];
      finalizingRef.current = false;
    },
    [clearTimer, stopTracks],
  );

  const uploadBlob = useCallback(
    async (blob: Blob, format: string) => {
      setUploading(true);
      try {
        await onRecorded(blob, format);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("voiceUploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [onRecorded, t],
  );

  const finalizeRecording = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    clearTimer();
    setRecording(false);

    const mimeType = mimeTypeRef.current;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const shownSeconds = elapsedRef.current;

    if (blob.size < 1000) {
      failRecording(t("voiceRecordingTooShort"));
      return;
    }

    const audioSeconds = await measureBlobAudioSeconds(blob);
    if (audioSeconds != null && shownSeconds >= 25 && audioSeconds + 8 < shownSeconds) {
      failRecording(
        t("voiceRecordingTruncated", {
          captured: Math.max(1, Math.round(audioSeconds)),
          shown: formatRecordingTime(shownSeconds),
        }),
      );
      return;
    }

    try {
      await uploadBlob(blob, formatRef.current);
    } finally {
      stopTracks();
      recorderRef.current = null;
      chunksRef.current = [];
      finalizingRef.current = false;
    }
  }, [clearTimer, failRecording, stopTracks, t, uploadBlob]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
    };
  }, [clearTimer, stopTracks]);

  async function startRecording() {
    setError(null);
    finalizingRef.current = false;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setQuestionIndex(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      setMeterStream(stream);

      const { mimeType, format } = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      formatRef.current = format;

      const rec = new MediaRecorder(stream, { mimeType });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => failRecording(t("voiceRecorderError"));
      rec.onstop = () => {
        window.setTimeout(() => void finalizeRecording(), 200);
      };

      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          if (recorderRef.current?.state === "recording") {
            failRecording(t("voiceMicDisconnected"));
          }
        };
      }

      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("voiceMicDenied"));
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    try {
      if (rec.state === "recording") rec.requestData();
    } catch {
      // requestData unsupported on some browsers
    }
    rec.stop();
  }

  async function handleAudioFile(file: File) {
    setError(null);
    if (file.size > MAX_VOICE_UPLOAD_BYTES) {
      setError(t("voiceUploadAudioTooLarge"));
      return;
    }
    const format = audioFormatFromFile(file);
    if (!format) {
      setError(t("voiceUploadAudioInvalid"));
      return;
    }
    setSelectedAudioName(file.name);
    await uploadBlob(file, format);
  }

  async function handleTextFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      setPastedText(text);
    } catch {
      setError(t("voiceUploadFailed"));
    }
  }

  async function submitPastedText() {
    const text = pastedText.trim();
    if (text.length < 40) {
      setError(t("voicePasteTextTooShort"));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await onSubmitText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("voiceUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function goPrevQuestion() {
    setQuestionIndex((i) => Math.max(0, i - 1));
  }

  function goNextQuestion() {
    setQuestionIndex((i) => Math.min(total - 1, i + 1));
  }

  function switchMode(mode: InputMode) {
    if (busy || recording) return;
    setError(null);
    setInputMode(mode);
  }

  const audioAccept = ALLOWED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`).join(",");

  return (
    <div className="space-y-5">
      {/* One question at a time */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90">
            {t("voiceQuestionProgress", { current: questionIndex + 1, total })}
          </p>
          <div className="flex gap-1">
            {ONBOARDING_VOICE_QUESTIONS.map((q, i) => (
              <button
                key={q.id}
                type="button"
                aria-label={t("voiceGoToQuestion", { n: i + 1 })}
                onClick={() => setQuestionIndex(i)}
                disabled={busy || recording}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === questionIndex
                    ? "w-6 bg-amber-300"
                    : i < questionIndex
                      ? "w-2 bg-amber-300/45"
                      : "w-2 bg-white/15",
                )}
              />
            ))}
          </div>
        </div>

        <p className="mt-6 font-mono text-sm text-amber-300/80">Q{currentQuestion.id}</p>
        <h2 className="mt-3 text-lg font-semibold leading-relaxed text-white sm:text-xl">
          {questionLabel(currentQuestion, language)}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-zinc-500">
          {inputMode === "text"
            ? t("voicePasteTextQuestionHint")
            : recording
              ? t("voiceAnswerThisThenNext")
              : t("voicePreviewHint")}
        </p>

        {inputMode !== "text" ? (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={questionIndex === 0 || busy}
              onClick={goPrevQuestion}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {t("voicePrevQuestion")}
            </button>
            <button
              type="button"
              disabled={isLastQuestion || busy}
              onClick={goNextQuestion}
              className="inline-flex items-center gap-1 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-bold text-amber-200 transition hover:bg-amber-300/20 disabled:opacity-40"
            >
              {t("voiceNextQuestion")}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {recording && isLastQuestion ? (
          <p className="mt-4 text-center text-xs font-medium text-emerald-300/90">
            {t("voiceAllQuestionsSeen")}
          </p>
        ) : null}
      </div>

      {/* Input mode tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {(
          [
            { id: "record" as const, label: t("voiceInputRecord"), icon: Mic },
            { id: "upload" as const, label: t("voiceInputUpload"), icon: FileAudio },
            { id: "text" as const, label: t("voiceInputPaste"), icon: FileText },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={busy || recording}
            onClick={() => switchMode(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition",
              inputMode === id
                ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
              (busy || recording) && inputMode !== id && "opacity-50",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Input panel */}
      {inputMode === "record" ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-8 text-center sm:p-10">
          <OnboardingVoiceLevelMeter stream={meterStream} active={recording && !uploading} />

          <div
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full border-2 transition sm:h-24 sm:w-24",
              recording
                ? "border-red-400/60 bg-red-400/10 animate-pulse"
                : "border-amber-300/40 bg-amber-300/10",
            )}
          >
            {uploading ? (
              <Loader2 className="h-9 w-9 animate-spin text-amber-300" />
            ) : recording ? (
              <Square className="h-8 w-8 text-red-300" aria-hidden />
            ) : (
              <Mic className="h-9 w-9 text-amber-300" aria-hidden />
            )}
          </div>

          <p className="text-base font-semibold text-white sm:text-lg">
            {uploading
              ? t("voiceUploading")
              : recording
                ? t("voiceRecording", { time: formatRecordingTime(elapsed) })
                : t("voicePressRecord")}
          </p>
          <p className="max-w-lg text-sm leading-relaxed text-zinc-500">{t("voiceMemoHint")}</p>

          {!recording && !uploading ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void startRecording()}
              className="rounded-xl bg-amber-300 px-8 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-200 disabled:opacity-50 sm:text-base"
            >
              {t("voiceStartRecording")}
            </button>
          ) : recording ? (
            <button
              type="button"
              onClick={stopRecording}
              className="rounded-xl border border-red-400/50 bg-red-400/10 px-6 py-3 text-sm font-bold text-red-200 transition hover:bg-red-400/20"
            >
              {t("voiceStopTranscribe")}
            </button>
          ) : null}
        </div>
      ) : inputMode === "upload" ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-8 text-center sm:p-10">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-300/40 bg-amber-300/10 sm:h-24 sm:w-24">
            {uploading ? (
              <Loader2 className="h-9 w-9 animate-spin text-amber-300" />
            ) : (
              <Upload className="h-9 w-9 text-amber-300" aria-hidden />
            )}
          </div>

          <p className="text-base font-semibold text-white sm:text-lg">
            {uploading ? t("voiceUploading") : t("voiceUploadAudioTitle")}
          </p>
          <p className="max-w-lg text-sm leading-relaxed text-zinc-500">{t("voiceUploadAudioHint")}</p>
          {selectedAudioName ? (
            <p className="text-xs font-medium text-amber-200/90">{selectedAudioName}</p>
          ) : null}

          <input
            ref={audioFileInputRef}
            type="file"
            accept={audioAccept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAudioFile(file);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => audioFileInputRef.current?.click()}
            className="rounded-xl bg-amber-300 px-8 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-200 disabled:opacity-50 sm:text-base"
          >
            {t("voiceUploadAudioButton")}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-6 sm:p-8">
          <div>
            <p className="text-base font-semibold text-white">{t("voicePasteTextTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{t("voicePasteTextHint")}</p>
          </div>

          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            disabled={busy}
            placeholder={t("voicePasteTextPlaceholder")}
            className={onboardingTextareaClass}
          />

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={textFileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleTextFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => textFileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" aria-hidden />
              {t("voiceUploadTextFile")}
            </button>
            <button
              type="button"
              disabled={busy || pastedText.trim().length < 40}
              onClick={() => void submitPastedText()}
              className="rounded-xl bg-amber-300 px-6 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-200 disabled:opacity-50"
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("voiceUploading")}
                </span>
              ) : (
                t("voiceSubmitText")
              )}
            </button>
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

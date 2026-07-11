/** Bilingual onboarding voice questions (mirrors backend). */

export type OnboardingLang = "de" | "en";

export type OnboardingVoiceQuestion = {
  id: string;
  text_de: string;
  text_en: string;
};

export const ONBOARDING_VOICE_QUESTIONS: OnboardingVoiceQuestion[] = [
  {
    id: "1",
    text_de:
      "Wer bist du und was ist deine Geschichte – beruflich und persönlich? Was ist die Mission deines Business, und welches Problem am Markt hat dich zur Gründung bewegt?",
    text_en:
      "Who are you and what is your story — professionally and personally? What is your business mission, and what market problem drove you to start?",
  },
  {
    id: "2",
    text_de: "Wie hoch ist dein aktueller Jahresumsatz, und wo liegt momentan dein größter Engpass?",
    text_en: "What is your current annual revenue, and where is your biggest bottleneck right now?",
  },
  {
    id: "3",
    text_de: "Was unterscheidet dich klar von anderen Anbietern in deiner Branche?",
    text_en: "What clearly differentiates you from other providers in your industry?",
  },
  {
    id: "4",
    text_de:
      "Liste deine Angebote auf (Name, Inhalt, Preis, Zielgruppe) – welches ist dein Hauptfokus?",
    text_en:
      "List your offers (name, content, price, target audience) — which is your main focus?",
  },
  {
    id: "5",
    text_de:
      "Welche Transformation durchlaufen deine Kunden bei dir, und hast du eine eigene Methode oder ein System dafür?",
    text_en:
      "What transformation do your clients go through with you, and do you have your own method or system for it?",
  },
  {
    id: "6",
    text_de: "Wie kommen aktuell neue Leads zu dir, und wie läuft ein Verkaufsgespräch bei dir ab?",
    text_en: "How do new leads currently find you, and how does a sales conversation work for you?",
  },
  {
    id: "7",
    text_de: "Was ist dein bisher erfolgreichster Kundenfall (mit konkretem Ergebnis)?",
    text_en: "What is your most successful client case so far (with a concrete result)?",
  },
  {
    id: "8",
    text_de:
      "Wer genau ist dein idealer Kunde – demografisch und psychografisch – und was ist sein größtes Problem?",
    text_en:
      "Who exactly is your ideal customer — demographically and psychographically — and what is their biggest problem?",
  },
  {
    id: "9",
    text_de:
      "Was sind deine wichtigsten Ziele für dein Business und deine Content-Strategie in den nächsten 6–12 Monaten?",
    text_en:
      "What are your most important goals for your business and content strategy in the next 6–12 months?",
  },
  {
    id: "10",
    text_de:
      "Wie soll sich deine Marke anfühlen und aussehen – und was möchtest du auf keinen Fall sehen?",
    text_en: "How should your brand feel and look — and what do you never want to see?",
  },
];

export function questionLabel(q: OnboardingVoiceQuestion, lang: OnboardingLang): string {
  return lang === "en" ? q.text_en : q.text_de;
}

export function pickRecorderMimeType(): { mimeType: string; format: string } {
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", format: "webm" },
    { mimeType: "audio/webm", format: "webm" },
    { mimeType: "audio/mp4", format: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", format: "ogg" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "audio/webm", format: "webm" };
}

export function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const MAX_VOICE_UPLOAD_BYTES = 24 * 1024 * 1024;

export const ALLOWED_AUDIO_EXTENSIONS = [
  "webm",
  "mp4",
  "m4a",
  "mp3",
  "wav",
  "ogg",
  "aac",
] as const;

export type AllowedAudioExtension = (typeof ALLOWED_AUDIO_EXTENSIONS)[number];

const MIME_TO_FORMAT: Record<string, AllowedAudioExtension> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
};

export function audioFormatFromFile(file: File): AllowedAudioExtension | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    return ext as AllowedAudioExtension;
  }
  const mime = file.type.split(";")[0]?.trim().toLowerCase();
  return mime ? (MIME_TO_FORMAT[mime] ?? null) : null;
}

/** Decode captured audio duration (seconds). Returns null if the browser cannot decode. */
export async function measureBlobAudioSeconds(blob: Blob): Promise<number | null> {
  try {
    const ctx = new AudioContext();
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    await ctx.close();
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return null;
    return audio.duration;
  } catch {
    return null;
  }
}

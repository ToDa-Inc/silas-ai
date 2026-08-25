/** English section titles the strategy-doc prompts still emit even for German transcripts. */
const EN_TO_DE_HEADINGS: Array<[string, string]> = [
  ["Additional Observations", "Weitere Beobachtungen"],
  ["Overall Tone and Style", "Gesamtton und Stil"],
  ["Sentence Structure", "Satzstruktur"],
  ["Vocabulary and Language Use", "Wortschatz und Sprachgebrauch"],
  ["Explanation Techniques", "Erklärungstechniken"],
  ["Personal Elements", "Persönliche Elemente"],
  ["Persuasion and Credibility", "Überzeugung und Glaubwürdigkeit"],
  ["Pacing and Emphasis", "Rhythmus und Betonung"],
  ["Unique Characteristics", "Besondere Merkmale"],
  ["Business Information", "Geschäftsinformationen"],
  ["Vision and Goals", "Vision und Ziele"],
  ["Personal Brand Elements", "Elemente der Personal Brand"],
  ["Personal Information", "Persönliche Informationen"],
  ["Pains and Challenges", "Schmerzen und Herausforderungen"],
  ["Desires and Goals", "Wünsche und Ziele"],
  ["Products or Services", "Produkte oder Dienstleistungen"],
  ["Key Stories", "Schlüsselgeschichten"],
  ["Demographics Analysis", "Demografische Analyse"],
  ["Psychographics Analysis", "Psychografische Analyse"],
  ["Lifestyle and Behaviors", "Lebensstil und Verhalten"],
  ["Challenges and Goals", "Herausforderungen und Ziele"],
  ["Emotional Needs", "Emotionale Bedürfnisse"],
  ["Reddit and Quora Research", "Reddit- und Quora-Recherche"],
  ["Information not available", "Information nicht verfügbar"],
  ["Unclear from transcript", "Aus dem Transkript unklar"],
  ["Not covered in transcript", "Im Transkript nicht behandelt"],
  ["Clarification needed", "Klärung nötig"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Swap leftover English strategy-doc headings when the UI locale is German. */
export function localizeStrategyDocHeadings(text: string, locale: string): string {
  if (locale !== "de" || !text) return text;
  const headings = [...EN_TO_DE_HEADINGS].sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [en, de] of headings) {
    out = out.replace(new RegExp(escapeRegExp(en), "gi"), de);
  }
  return out;
}

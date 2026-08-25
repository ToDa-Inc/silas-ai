import assert from "node:assert/strict";
import test from "node:test";
import { localizeStrategyDocHeadings } from "./localize-strategy-doc-headings";

test("replaces English strategy-doc headings when locale is German", () => {
  const input = [
    "1. Overall Tone and Style:",
    "Direkt, klar, ohne Floskeln.",
    "**1. Additional Observations:**",
    "- Konsequenter Anti-Extrem-Ansatz",
    "9. Additional Observations:",
  ].join("\n");

  const out = localizeStrategyDocHeadings(input, "de");

  assert.match(out, /Gesamtton und Stil/);
  assert.match(out, /Weitere Beobachtungen/);
  assert.doesNotMatch(out, /Additional Observations/);
  assert.doesNotMatch(out, /Overall Tone and Style/);
  assert.match(out, /Direkt, klar, ohne Floskeln/);
});

test("leaves English headings untouched for English locale", () => {
  const input = "1. Additional Observations:\nKeep this heading.";
  assert.equal(localizeStrategyDocHeadings(input, "en"), input);
});

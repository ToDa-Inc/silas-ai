import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const messagesDir = join(dirname(fileURLToPath(import.meta.url)), "../../messages");

function loadCatalog(name: "en.json" | "de.json"): Record<string, unknown> {
  return JSON.parse(readFileSync(join(messagesDir, name), "utf8")) as Record<string, unknown>;
}

function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return leafKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

test("en and de message catalogs have the same keys", () => {
  assert.deepEqual(leafKeys(loadCatalog("en.json")).sort(), leafKeys(loadCatalog("de.json")).sort());
});

test("onboarding talking-head guided copy exists in both locales", () => {
  const en = (loadCatalog("en.json").onboarding ?? {}) as Record<string, unknown>;
  const de = (loadCatalog("de.json").onboarding ?? {}) as Record<string, unknown>;
  for (const key of ["talkingHeadGuidedTitle", "talkingHeadGuidedHint", "talkingHeadGuidedContinue"]) {
    assert.equal(typeof en[key], "string");
    assert.equal(typeof de[key], "string");
    assert.ok(String(en[key]).length > 0);
    assert.ok(String(de[key]).length > 0);
  }
});

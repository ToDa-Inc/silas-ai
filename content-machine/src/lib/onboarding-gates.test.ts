import assert from "node:assert/strict";
import test from "node:test";
import { dashboardPathAllowedDuringOnboarding } from "./onboarding-gates.ts";

test("media library is reachable during incomplete onboarding", () => {
  assert.equal(dashboardPathAllowedDuringOnboarding("/media"), true);
  assert.equal(dashboardPathAllowedDuringOnboarding("/media?tab=images"), true);
  assert.equal(dashboardPathAllowedDuringOnboarding("/media/"), true);
});

test("other dashboard routes stay gated until onboarding is done", () => {
  assert.equal(dashboardPathAllowedDuringOnboarding("/dashboard"), false);
  assert.equal(dashboardPathAllowedDuringOnboarding("/generate"), false);
  assert.equal(dashboardPathAllowedDuringOnboarding("/intelligence"), false);
});

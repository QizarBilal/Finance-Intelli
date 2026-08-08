import assert from "node:assert/strict";
import test from "node:test";
import { nextOccurrence, periodRange } from "./dates.ts";

test("today uses the user's IANA timezone near a UTC date boundary", () => {
  const now = new Date("2026-08-08T20:00:00.000Z");
  assert.deepEqual(periodRange("today", "Asia/Kolkata", "monday", now), { from: "2026-08-09", to: "2026-08-09" });
});

test("weekly range honors a Sunday week start", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");
  assert.deepEqual(periodRange("weekly", "UTC", "sunday", now), { from: "2026-08-09", to: "2026-08-15" });
});

test("monthly recurrence clamps safely at month end", () => {
  assert.equal(nextOccurrence("2024-01-31", "monthly"), "2024-02-29");
  assert.equal(nextOccurrence("2025-01-31", "monthly"), "2025-02-28");
});

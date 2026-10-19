import test from "node:test";
import assert from "node:assert/strict";
import { deriveTrainingSchedule, trainingWindow } from "./training-schedule";
import type { CalendarEvent } from "./schema";
const event = (date: string, patch: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: date, date, type: "training", title: "Training", team: "c-jugend", field: "a-platz", startTime: "18:00", endTime: "19:30", bfvImported: false, createdAt: "", updatedAt: "", ...patch });
test("requires repeated dates and excludes single, pending, past and non-training events", () => {
  const events = [event("2026-10-19"), event("2026-10-26"), event("2026-10-26"), event("2026-10-20"), event("2026-10-27", { isPending: true }), event("2026-10-12"), event("2026-11-16"), event("2026-10-21", { type: "spiel" }), event("2026-10-28", { type: "spiel" }), event("2026-10-22", { team: "herren" }), event("2026-10-29", { team: "herren" })];
  const slots = deriveTrainingSchedule(events, "2026-10-19");
  assert.equal(slots.length, 2);
  assert.equal(slots[1].team, "herren");
  assert.deepEqual(slots[0].dates, ["2026-10-19", "2026-10-26"]);
  assert.equal(slots[0].weekday, 0);
  assert.ok(!("title" in slots[0]));
});
test("keeps different places, times and teams separate, including across year and DST boundaries", () => {
  const events = [event("2026-10-19"), event("2026-10-26"), event("2026-10-19", { field: "b-platz" }), event("2026-10-26", { field: "b-platz" }), event("2026-10-19", { startTime: "17:00" }), event("2026-10-26", { team: "d-jugend" })];
  const slots = deriveTrainingSchedule(events, "2026-10-19");
  assert.equal(slots.length, 2);
  assert.equal(slots[0].startTime, "18:00");
  assert.deepEqual(trainingWindow("2026-12-21"), { start: "2026-12-21", end: "2027-01-17" });
});

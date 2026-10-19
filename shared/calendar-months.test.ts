import test from "node:test";
import assert from "node:assert/strict";
import { visibleCalendarMonths } from "./calendar-months";

test("hides whole past months while preserving the current month and future years", () => {
  const today = new Date(2026, 9, 19);
  assert.deepEqual(visibleCalendarMonths(2026, today), [9, 10, 11]);
  assert.deepEqual(visibleCalendarMonths(2025, today), []);
  assert.equal(visibleCalendarMonths(2027, today).length, 12);
  assert.equal(visibleCalendarMonths(2025, today, true).length, 12);
  assert.equal(visibleCalendarMonths(2026, new Date(2026, 0, 1)).length, 12);
  assert.deepEqual(visibleCalendarMonths(2026, new Date(2026, 11, 31)), [11]);
});

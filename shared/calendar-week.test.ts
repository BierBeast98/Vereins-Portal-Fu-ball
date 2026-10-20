import test from "node:test";
import assert from "node:assert/strict";
import { calendarWeek, shiftCalendarDate } from "./calendar-week";

test("ISO weeks span month and year boundaries without dropping dates", () => {
  const week = calendarWeek("2027-01-01");
  assert.deepEqual(week, { start: "2026-12-28", end: "2027-01-03", days: ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"], number: 53, year: 2026 });
  assert.equal(calendarWeek("2027-01-04").number, 1);
  assert.equal(calendarWeek("2027-01-04").year, 2027);
  assert.equal(calendarWeek("2026-10-20").start, "2026-10-19");
});

test("week navigation and consecutive dates survive leap days and DST", () => {
  assert.equal(shiftCalendarDate("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftCalendarDate("2027-01-04", -7), "2026-12-28");
  assert.equal(calendarWeek("2026-03-29").end, "2026-03-29");
  assert.equal(shiftCalendarDate("2026-03-29", 1), "2026-03-30");
  assert.equal(calendarWeek("2026-10-25").days.length, 7);
  assert.equal(shiftCalendarDate("2026-10-25", 1), "2026-10-26");
});

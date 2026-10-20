const dateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const localDate = (date: string) => { const [year, month, day] = date.split("-").map(Number); return new Date(year, month - 1, day, 12); };

/** Calendar arithmetic preserves local dates across daylight-saving changes. */
export function shiftCalendarDate(date: string, days: number): string {
  const value = localDate(date);
  value.setDate(value.getDate() + days);
  return dateString(value);
}

export function calendarWeek(date: string) {
  const value = localDate(date);
  const start = shiftCalendarDate(date, -((value.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, offset) => shiftCalendarDate(start, offset));
  // The ISO week year is the year of its Thursday, which may differ at New Year.
  const thursday = localDate(days[3]);
  const year = thursday.getFullYear();
  const utcThursday = Date.UTC(year, thursday.getMonth(), thursday.getDate());
  const number = Math.ceil(((utcThursday - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { start, end: days[6], days, number, year };
}

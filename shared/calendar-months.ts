/** Whole months before the current month are hidden; the selected year stays explicit. */
export function visibleCalendarMonths(year: number, today: Date, showPast = false): number[] {
  return Array.from({ length: 12 }, (_, month) => month).filter(month => showPast || year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth()));
}

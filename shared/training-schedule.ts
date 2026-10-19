import type { CalendarEvent, Field, Team } from "./schema";

export interface TrainingSlot {
  team: Team;
  weekday: number;
  startTime: string;
  endTime: string;
  field?: Field;
  location?: string;
  dates: string[];
}

export function trainingWindow(start: string) {
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 27);
  return { start, end: end.toISOString().slice(0, 10) };
}

/** Repeated confirmed team training within the visible window, never pending proposals. */
export function deriveTrainingSchedule(events: CalendarEvent[], start: string): TrainingSlot[] {
  const { end } = trainingWindow(start);
  const groups = new Map<string, TrainingSlot>();
  for (const event of events) {
    if (event.type !== "training" || event.isPending || !event.team || event.date < start || event.date > end) continue;
    const weekday = (new Date(`${event.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const key = JSON.stringify([event.team, weekday, event.startTime, event.endTime, event.field, event.location]);
    const slot = groups.get(key) ?? { team: event.team, weekday, startTime: event.startTime, endTime: event.endTime, field: event.field, location: event.location, dates: [] };
    if (!slot.dates.includes(event.date)) slot.dates.push(event.date);
    groups.set(key, slot);
  }
  return Array.from(groups.values()).filter(slot => slot.dates.length >= 2).map(slot => ({ ...slot, dates: slot.dates.sort() })).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

import type { CalendarEvent, Field } from "@shared/schema";
import { FIELDS, FIELD_LABELS } from "@shared/schema";
import { useMemo } from "react";

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDE(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function getEventPosition(event: CalendarEvent) {
  const startHour = parseInt(event.startTime.split(":")[0]);
  const startMin = parseInt(event.startTime.split(":")[1]);
  const endHour = parseInt(event.endTime.split(":")[0]);
  const endMin = parseInt(event.endTime.split(":")[1]);

  const top = ((startHour - 7) * 60 + startMin) * (48 / 60);
  const height = ((endHour - startHour) * 60 + (endMin - startMin)) * (48 / 60);

  return { top, height: Math.max(height, 24) };
}

export interface FieldScheduleProps {
  events: CalendarEvent[];
  startDate: string;
  days: number;
  fields: Field[];
}

export function FieldSchedule({ events, startDate, days, fields }: FieldScheduleProps) {
  const baseDate = new Date(startDate + "T00:00:00");
  const dates = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      return d;
    });
  }, [baseDate, days]);

  const today = formatDate(new Date());

  const eventsByFieldAndDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      if (!event.field) return;
      const key = `${event.field}-${event.date}`;
      const existing = map.get(key) || [];
      existing.push(event);
      map.set(key, existing);
    });
    return map;
  }, [events]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {fields.map((field) => (
        <div key={field} className="border rounded-lg bg-card shadow-sm">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm md:text-base">{FIELD_LABELS[field]}</h3>
          </div>
          <div className="px-4 py-3 overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 gap-1 mb-2">
                <div className="text-xs text-muted-foreground" />
                {dates.map((date, i) => {
                  const dateStr = formatDate(date);
                  const isToday = dateStr === today;
                  return (
                    <div
                      key={i}
                      className={`
                        text-center text-xs font-medium p-2 rounded
                        ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}
                      `}
                    >
                      <div>{WEEKDAYS_SHORT[i % 7]}</div>
                      <div>{formatDateDE(date)}</div>
                    </div>
                  );
                })}
              </div>

              <div className="relative">
                <div className="grid grid-cols-8 gap-1">
                  <div className="space-y-0">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="h-12 text-xs text-muted-foreground text-right pr-2 -mt-2"
                      >
                        {hour}:00
                      </div>
                    ))}
                  </div>

                  {dates.map((date, dayIndex) => {
                    const dateStr = formatDate(date);
                    const key = `${field}-${dateStr}`;
                    const dayEvents = eventsByFieldAndDate.get(key) || [];

                    return (
                      <div
                        key={dayIndex}
                        className="relative bg-muted/30 rounded"
                        style={{ height: `${HOURS.length * 48}px` }}
                      >
                        {HOURS.map((hour) => (
                          <div
                            key={hour}
                            className="absolute w-full border-t border-muted/60"
                            style={{ top: `${(hour - 7) * 48}px` }}
                          />
                        ))}

                        {dayEvents.map((event) => {
                          const { top, height } = getEventPosition(event);
                          return (
                            <div
                              key={event.id}
                              className="absolute left-0.5 right-0.5 rounded-md p-1 text-xs overflow-hidden bg-primary text-primary-foreground/95 shadow-sm"
                              style={{ top: `${top}px`, height: `${height}px` }}
                            >
                              <div className="font-medium truncate">{event.title}</div>
                              {height > 30 && (
                                <div className="truncate opacity-80">
                                  {event.startTime} - {event.endTime}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


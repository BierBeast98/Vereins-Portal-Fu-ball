import type { CalendarEvent, Field } from "@shared/schema";
import { FIELDS, FIELD_LABELS, getTeamEventColorClass, EVENT_TYPE_COLORS } from "@shared/schema";
import { useMemo } from "react";

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// Relevant time span for field planning: 08:00–20:00
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

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

  const top = ((startHour - 8) * 60 + startMin) * (48 / 60);
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

  // Auswärtsspiele finden nicht auf unseren Plätzen statt → nicht in der Platzbelegung anzeigen
  const eventsOnOurPitches = useMemo(
    () => events.filter((e) => e.type !== "spiel" || e.isHomeGame !== false),
    [events]
  );

  const eventsByFieldAndDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    eventsOnOurPitches.forEach((event) => {
      if (!event.field) return;
      const key = `${event.field}-${event.date}`;
      const existing = map.get(key) || [];
      existing.push(event);
      map.set(key, existing);
    });
    return map;
  }, [eventsOnOurPitches]);

  // Kompaktere Zeilenhöhe (40px), damit mehr im Fenster sichtbar ist
  const rowHeight = 40;
  const totalHeight = HOURS.length * rowHeight;

  const getEventPositionResized = (event: CalendarEvent) => {
    const { top: t, height: h } = getEventPosition(event);
    const scale = rowHeight / 48;
    return { top: t * scale, height: Math.max(h * scale, 20) };
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      {fields.map((field) => (
        <div key={field} className="border rounded-lg bg-card shadow-sm min-w-0">
          <div className="px-3 py-2 border-b">
            <h3 className="font-semibold text-sm">{FIELD_LABELS[field]}</h3>
          </div>
          <div className="p-3 min-w-0 overflow-x-auto overflow-y-hidden">
            {/* Grid nutzt volle Breite: 1 Spalte Zeit + 7 Tage, alle Tage gleich breit */}
            <div
              className="grid gap-0.5 mb-1 w-full"
              style={{ gridTemplateColumns: "auto repeat(7, minmax(0, 1fr))" }}
            >
              <div className="text-[10px] text-muted-foreground py-1 pr-1 text-right" />
              {dates.map((date, i) => {
                const dateStr = formatDate(date);
                const isToday = dateStr === today;
                const weekdayIndex = (date.getDay() + 6) % 7;
                return (
                  <div
                    key={i}
                    className={`
                      text-center text-[10px] font-medium py-1 px-0.5 rounded
                      ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}
                    `}
                  >
                    <div>{WEEKDAYS_SHORT[weekdayIndex]}</div>
                    <div>{formatDateDE(date)}</div>
                  </div>
                );
              })}
            </div>

            <div className="relative w-full">
              <div
                className="grid gap-0.5 w-full"
                style={{ gridTemplateColumns: "auto repeat(7, minmax(0, 1fr))" }}
              >
                <div className="space-y-0 flex flex-col">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="text-[10px] text-muted-foreground text-right pr-1 flex-shrink-0"
                      style={{ height: rowHeight }}
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
                      className="relative bg-muted/30 rounded min-w-0"
                      style={{ height: totalHeight }}
                    >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="absolute w-full border-t border-muted/60"
                          style={{ top: `${(hour - 8) * rowHeight}px` }}
                        />
                      ))}

                      {dayEvents.map((event) => {
                        const { top, height } = getEventPositionResized(event);
                        const colorClass = event.team
                          ? getTeamEventColorClass(event.team, event.type)
                          : `${EVENT_TYPE_COLORS[event.type]} text-white`;
                        return (
                          <div
                            key={event.id}
                            className={`
                              absolute left-0.5 right-0.5 rounded p-0.5 text-[10px] overflow-hidden shadow-sm
                              ${colorClass}
                            `}
                            style={{ top: `${top}px`, height: `${height}px` }}
                          >
                            <div className="font-medium truncate leading-tight">{event.title}</div>
                            {height > 22 && (
                              <div className="truncate opacity-80 leading-tight">
                                {event.startTime}-{event.endTime}
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
      ))}
    </div>
  );
}


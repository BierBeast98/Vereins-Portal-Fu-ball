import type { CalendarEvent, Field, Team } from "@shared/schema";
import { getTeamEventColorClass, EVENT_TYPE_COLORS, TEAM_LABELS } from "@shared/schema";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventActionDialog } from "@/components/event-action-dialog";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getEventDotBg(event: CalendarEvent): string {
  if (event.isPending) return "bg-gray-300 dark:bg-gray-600";
  const colorClass = event.team
    ? getTeamEventColorClass(event.team, event.type)
    : `${EVENT_TYPE_COLORS[event.type]} text-white`;
  return colorClass.split(" ").find((c) => c.startsWith("bg-")) ?? "bg-primary";
}

interface MobileFieldCalendarProps {
  fieldView: "a" | "b";
  onFieldChange: (f: "a" | "b") => void;
  onRequestTraining: () => void;
}

export function MobileFieldCalendar({
  fieldView,
  onFieldChange,
  onRequestTraining,
}: MobileFieldCalendarProps) {
  const field: Field = fieldView === "a" ? "a-platz" : "b-platz";

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [actionEvent, setActionEvent] = useState<{ event: CalendarEvent; mode: "delete" | "change" } | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDateStr = formatDate(monthStart);
  const endDateStr = formatDate(monthEnd);

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/public/calendar/fields", startDateStr, endDateStr],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/calendar/fields?startDate=${startDateStr}&endDate=${endDateStr}`
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const fieldEvents = useMemo(
    () =>
      events.filter(
        (e) => e.field === field && (e.type !== "spiel" || e.isHomeGame !== false)
      ),
    [events, field]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    fieldEvents.forEach((e) => {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    });
    return map;
  }, [fieldEvents]);

  const calendarDays = useMemo(() => {
    const start = new Date(monthStart);
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [monthStart]);

  const today = formatDate(new Date());
  const selectedStr = formatDate(selectedDate);
  const selectedEvents = (eventsByDate.get(selectedStr) ?? []).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  function prevMonth() {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(d);
  }
  function nextMonth() {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(d);
  }
  function goToday() {
    const now = new Date();
    setCurrentMonth(now);
    setSelectedDate(now);
  }

  return (
    <div className="md:flex md:gap-8 md:items-start">

      {/* Linke Spalte: Kalender */}
      <div className="md:flex-1 min-w-0">
        {/* Obere Leiste: Platz-Toggle + Heute */}
        <div className="flex items-center justify-between mb-3">
          <div
            className="inline-flex rounded-lg border bg-background shadow-sm"
            role="group"
            aria-label="Platz wählen"
          >
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-l-lg border-r transition-colors ${
                fieldView === "a"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => onFieldChange("a")}
            >
              A-Platz
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${
                fieldView === "b"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => onFieldChange("b")}
            >
              B-Platz
            </button>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-primary px-2 py-1"
            onClick={goToday}
          >
            Heute
          </button>
        </div>

        {/* Monatsnavigation */}
        <div className="flex items-center justify-between mb-2 px-1">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-muted active:bg-muted/80"
            onClick={prevMonth}
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-base font-semibold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: de })}
          </h3>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-muted active:bg-muted/80"
            onClick={nextMonth}
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Kalenderraster */}
        <div className="border rounded-2xl bg-card overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b bg-muted/20">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((date, i) => {
              const dateStr = formatDate(date);
              const inMonth = date.getMonth() === currentMonth.getMonth();
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedStr;
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const isLastRow = i >= 35;
              const isRightEdge = (i + 1) % 7 === 0;

              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    "flex flex-col items-center pt-1.5 pb-1 min-h-[54px] md:min-h-[64px]",
                    !isLastRow ? "border-b" : "",
                    !isRightEdge ? "border-r" : "",
                    !inMonth ? "opacity-25" : "",
                    isSelected && !isToday ? "bg-primary/10" : "",
                    "hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedDate(new Date(date))}
                >
                  <span
                    className={[
                      "w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium",
                      isToday
                        ? "bg-primary text-primary-foreground font-bold"
                        : isSelected
                        ? "ring-2 ring-primary"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex gap-[3px] mt-1 h-2 items-center">
                    {dayEvents.slice(0, 3).map((ev, j) => (
                      <span
                        key={j}
                        className={`w-1.5 h-1.5 rounded-full ${getEventDotBg(ev)}`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rechte Spalte (Desktop) / Unten (Mobile): Tagesliste */}
      <div className="mt-5 md:mt-0 md:w-80 md:sticky md:top-4">
        <p className="text-sm font-semibold mb-3 capitalize">
          {format(selectedDate, "EEEE, d. MMMM", { locale: de })}
        </p>

        {selectedEvents.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8 border rounded-xl bg-card">
            Keine Einträge für diesen Tag
          </div>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((event) => {
              const bgClass = getEventDotBg(event);
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border bg-card shadow-sm${event.isPending ? " opacity-60 border-dashed" : ""}`}
                >
                  <span
                    className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${bgClass}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-snug">{event.title}</p>
                      {event.isPending && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          Vorschlag
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.startTime} – {event.endTime}
                      {event.team && <> · {TEAM_LABELS[event.team as Team] ?? event.team}</>}
                    </p>
                  </div>
                  {!event.isPending && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Änderung vorschlagen"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => setActionEvent({ event, mode: "change" })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Löschen vorschlagen"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setActionEvent({ event, mode: "delete" })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button className="w-full mt-4" onClick={onRequestTraining}>
          Training vorschlagen
        </Button>
      </div>

      {actionEvent && (
        <EventActionDialog
          event={actionEvent.event}
          mode={actionEvent.mode}
          onClose={() => setActionEvent(null)}
        />
      )}
    </div>
  );
}

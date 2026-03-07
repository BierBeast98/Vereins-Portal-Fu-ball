import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  parseISO,
  addYears,
  subYears,
} from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@shared/schema";

const TEAM_LABELS: Record<string, string> = {
  herren: "Herren",
  herren2: "Herren II",
  damen: "Damen",
  "alte-herren": "Alte Herren",
  "a-jugend": "A-Jugend",
  "b-jugend": "B-Jugend",
  "c-jugend": "C-Jugend",
  "d-jugend": "D-Jugend",
  "e-jugend": "E-Jugend",
  "f-jugend": "F-Jugend",
  "g-jugend": "G-Jugend",
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function MonthGrid({
  year,
  month,
  events,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  month: number; // 0-based
  events: CalendarEvent[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}) {
  const firstDay = startOfMonth(new Date(year, month));
  const lastDay = endOfMonth(new Date(year, month));
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });

  // Monday = 0 offset
  const startOffset = (getDay(firstDay) + 6) % 7;

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.date;
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(e);
  }

  return (
    <div className="select-none">
      <h3 className="text-sm font-semibold text-center mb-2 text-foreground">
        {format(firstDay, "MMMM", { locale: de })}
      </h3>
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] text-muted-foreground text-center py-0.5 font-medium">
            {d}
          </div>
        ))}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(dateKey) ?? [];
          const hasSpiel = dayEvents.some((e) => e.type === "spiel");
          const hasTraining = dayEvents.some((e) => e.type === "training");
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={dateKey}
              onClick={() => dayEvents.length > 0 && onSelectDate(day)}
              className={cn(
                "flex flex-col items-center justify-start py-0.5 rounded text-[11px] font-medium transition-colors",
                dayEvents.length > 0 ? "cursor-pointer hover:bg-accent" : "cursor-default",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                isToday && !isSelected && "ring-1 ring-primary rounded"
              )}
            >
              <span>{format(day, "d")}</span>
              <div className="flex gap-0.5 mt-0.5 h-1.5">
                {hasSpiel && (
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-blue-500"
                    )}
                  />
                )}
                {hasTraining && (
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-green-500"
                    )}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventList({ date, events }: { date: Date; events: CalendarEvent[] }) {
  const dayEvents = events.filter((e) => e.date === format(date, "yyyy-MM-dd"));
  if (dayEvents.length === 0) return null;

  return (
    <div className="space-y-2">
      {dayEvents.map((event) => (
        <div
          key={event.id}
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border",
            event.type === "spiel"
              ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
              : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
          )}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full mt-1.5 shrink-0",
              event.type === "spiel" ? "bg-blue-500" : "bg-green-500"
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{event.title}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
              {event.startTime && (
                <span>
                  {event.startTime}
                  {event.endTime ? ` – ${event.endTime}` : ""}
                </span>
              )}
              {event.team && <span>{TEAM_LABELS[event.team] ?? event.team}</span>}
              {event.field && <span>{event.field === "a-platz" ? "A-Platz" : "B-Platz"}</span>}
              {event.type === "spiel" && event.isHomeGame === false && (
                <span className="italic">Auswärtsspiel</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function YearCalendarOverview() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const startDate = format(startOfYear(new Date(year, 0)), "yyyy-MM-dd");
  const endDate = format(endOfYear(new Date(year, 0)), "yyyy-MM-dd");

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/public/calendar/fields", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/calendar/fields?startDate=${startDate}&endDate=${endDate}`
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="space-y-4">
      {/* Jahr-Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setYear((y) => y - 1);
            setSelectedDate(null);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-lg">{year}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setYear((y) => y + 1);
            setSelectedDate(null);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legende */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          Spiel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Training
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {months.map((m) => (
            <div key={m} className="h-36 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-8">
          {months.map((m) => (
            <MonthGrid
              key={m}
              year={year}
              month={m}
              events={events}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          ))}
        </div>
      )}

      {/* Detailansicht für ausgewählten Tag */}
      {selectedDate && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {format(selectedDate, "EEEE, d. MMMM yyyy", { locale: de })}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setSelectedDate(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <EventList date={selectedDate} events={events} />
        </div>
      )}
    </div>
  );
}

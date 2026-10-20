import { Fragment } from "react";
import { calendarWeek, shiftCalendarDate } from "@shared/calendar-week";
import type { CalendarEvent, Team } from "@shared/schema";
import { TEAM_COLORS, TEAM_BORDER_COLORS, EVENT_TYPE_COLORS } from "@shared/schema";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Punktfarbe: Heimspiel/Training = gefüllt in Teamfarbe, Auswärtsspiel = hohler Punkt,
 *  unbestätigter Vorschlag = amber, ohne Team = Typ-Farbe. */
function dotClass(event: CalendarEvent): string {
  const away = event.type === "spiel" && event.isHomeGame === false;
  if (away && event.team) return `bg-transparent border ${TEAM_BORDER_COLORS[event.team as Team]}`;
  if (event.isPending) return "bg-amber-400";
  if (event.team) return TEAM_COLORS[event.team as Team];
  return EVENT_TYPE_COLORS[event.type] ?? "bg-gray-500";
}

export interface MonthGridProps {
  year: number;
  /** 0-basiert (0 = Januar) */
  month: number;
  /** Bereits gefilterte Events, gruppiert nach "YYYY-MM-DD" */
  eventsByDate: Map<string, CalendarEvent[]>;
  /** Tage mit Platz-Konflikten ("YYYY-MM-DD") */
  conflictDates?: Set<string>;
  todayStr: string;
  onDayClick: (dateStr: string) => void;
  onTitleClick?: () => void;
  onWeekClick?: (dateStringMonday: string) => void;
  title?: string;
}

export function MonthGrid({
  year,
  month,
  eventsByDate,
  conflictDates,
  todayStr,
  onDayClick,
  onTitleClick,
  onWeekClick,
  title,
}: MonthGridProps) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7; // Woche beginnt Montag
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstDate = `${year}-${pad(month + 1)}-01`;
  const weeks = Array.from({ length: Math.ceil((startOffset + daysInMonth) / 7) }, (_, index) =>
    calendarWeek(shiftCalendarDate(firstDate, index * 7)),
  );

  return (
    <div className="select-none w-full">
      {title && (
        <button
          type="button"
          className="w-full text-center font-semibold text-sm pb-1 hover:text-primary transition-colors"
          onClick={onTitleClick}
          disabled={!onTitleClick}
        >
          {title}
        </button>
      )}
      <div className={`grid text-center ${onWeekClick ? "grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]" : "grid-cols-7"}`}>
        {onWeekClick && <div className="py-0.5 text-[10px] text-muted-foreground" aria-hidden="true">KW</div>}
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] text-muted-foreground py-0.5">
            {d}
          </div>
        ))}
        {weeks.map((week) => (
          <Fragment key={week.start}>
            {onWeekClick && (
              <button
                type="button"
                className="min-h-9 max-md:min-h-11 rounded text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                aria-label={`Kalenderwoche ${week.number} ${week.year} öffnen`}
                onClick={() => onWeekClick(week.start)}
              >
                KW {week.number}
              </button>
            )}
            {week.days.map((dateStr) => {
              if (!dateStr.startsWith(`${year}-${pad(month + 1)}-`)) return <div key={dateStr} />;
              const day = Number(dateStr.slice(-2));
              const dayEvents = eventsByDate.get(dateStr) ?? [];

              // Ein Punkt pro Team+Typ+Heim/Auswärts-Kombination, max. 4 sichtbar
              const seen = new Set<string>();
              const dots: CalendarEvent[] = [];
              for (const e of dayEvents) {
                const key = `${e.team ?? ""}|${e.type}|${e.type === "spiel" && e.isHomeGame === false ? "a" : "h"}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  dots.push(e);
                }
              }
              const shown = dots.slice(0, 4);
              const more = dots.length - shown.length;

              const isToday = dateStr === todayStr;
              const hasConflict = conflictDates?.has(dateStr) ?? false;

              return (
                <button
                  key={dateStr}
                  type="button"
                  className={[
                    "flex min-w-0 flex-col items-center justify-start rounded py-0.5 min-h-9 max-md:min-h-11 text-xs transition-colors hover:bg-accent/60",
                    hasConflict ? "ring-1 ring-destructive" : isToday ? "ring-1 ring-primary" : "",
                    isToday ? "font-bold" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`${day}.${month + 1}.${year}: ${dayEvents.length} Termine${hasConflict ? ", Platzkonflikt" : ""}`}
                  title={dayEvents.length ? dayEvents.map(event => `${event.startTime}–${event.endTime} ${event.title}`).join("\n") : "Keine Termine"}
                  onClick={() => onDayClick(dateStr)}
                  data-testid={`day-${dateStr}`}
                >
                  <span>{day}</span>
                  <span aria-hidden="true" className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5 px-0.5">
                    {shown.map((e, j) => (
                      <span key={j} className={`w-1.5 h-1.5 rounded-full ${dotClass(e)}`} />
                    ))}
                    {more > 0 && (
                      <span className="text-[9px] leading-none text-muted-foreground">+{more}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

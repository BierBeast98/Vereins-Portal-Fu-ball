import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { CalendarEvent, Field } from "@shared/schema";
import { 
  EVENT_TYPE_LABELS, 
  EVENT_TYPE_COLORS,
  TEAMS,
  TEAM_LABELS,
  FIELDS, 
  FIELD_LABELS,
  getTeamEventColorClass,
  TEAM_COLORS_SPIEL,
  TEAM_COLORS_TRAINING,
} from "@shared/schema";

const WEEKDAYS_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function getWeekDates(date: Date): Date[] {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(date: Date): string {
  // Use local date formatting to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDE(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// Relevant time span for field planning: 08:00–20:00
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

// Kompakte Zeilenhöhe, damit mehr im Fenster sichtbar ist
const ROW_HEIGHT = 40;

export default function FieldsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [fieldView, setFieldView] = useState<Field>("a-platz");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const startDate = formatDate(weekDates[0]);
  const endDate = formatDate(weekDates[6]);

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  // Ausstehende Vorschläge ebenfalls laden und als grau anzeigen
  const { data: pendingRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/event-requests", "pending", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/event-requests?status=pending&fromDate=${startDate}T00:00:00&toDate=${endDate}T23:59:59`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch pending requests");
      return res.json();
    },
  });

  // Pending Requests in CalendarEvent-Format umwandeln
  const pendingEvents = useMemo<CalendarEvent[]>(() => {
    return pendingRequests.map((r) => {
      const startD = new Date(r.startAt);
      const endD = new Date(r.endAt);
      const date = formatDate(startD);
      const startTime = `${String(startD.getHours()).padStart(2, "0")}:${String(startD.getMinutes()).padStart(2, "0")}`;
      const endTime = `${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}`;
      return {
        id: r.id,
        title: r.title,
        type: "training" as const,
        team: r.team ?? undefined,
        field: r.pitch,
        date,
        startTime,
        endTime,
        bfvImported: false,
        isPending: true,
      } as CalendarEvent;
    });
  }, [pendingRequests]);

  const { data: conflicts = [] } = useQuery<{ event1: CalendarEvent; event2: CalendarEvent; reason: string }[]>({
    queryKey: ["/api/calendar/conflicts", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/conflicts?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conflicts");
      return res.json();
    },
  });

  const filteredEvents = useMemo(() => {
    const approved = events.filter((event) => {
      if (filterTeam !== "all" && event.team !== filterTeam) return false;
      // Auswärtsspiele finden nicht auf unseren Plätzen statt → nicht in der Platzbelegung anzeigen
      if (event.type === "spiel" && event.isHomeGame === false) return false;
      return true;
    });
    const pending = pendingEvents.filter((event) => {
      if (filterTeam !== "all" && event.team !== filterTeam) return false;
      return true;
    });
    return [...approved, ...pending];
  }, [events, pendingEvents, filterTeam]);

  const eventsByFieldAndDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      if (!event.field) return;
      const key = `${event.field}-${event.date}`;
      const existing = map.get(key) || [];
      existing.push(event);
      map.set(key, existing);
    });
    return map;
  }, [filteredEvents]);

  const goToPrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const today = formatDate(new Date());

  const getEventPosition = (event: CalendarEvent) => {
    const startHour = parseInt(event.startTime.split(":")[0]);
    const startMin = parseInt(event.startTime.split(":")[1]);
    const endHour = parseInt(event.endTime.split(":")[0]);
    const endMin = parseInt(event.endTime.split(":")[1]);
    const top = ((startHour - 8) * 60 + startMin) * (ROW_HEIGHT / 60);
    const height = ((endHour - startHour) * 60 + (endMin - startMin)) * (ROW_HEIGHT / 60);
    return { top, height: Math.max(height, 20) };
  };

  const conflictDates = useMemo(() => {
    const dates = new Set<string>();
    conflicts.forEach((c) => {
      dates.add(c.event1.date);
      dates.add(c.event2.date);
    });
    return dates;
  }, [conflicts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Platzbelegung</h1>
          <p className="text-muted-foreground text-sm">
            KW {getWeekNumber(weekDates[0])} | {formatDateDE(weekDates[0])} – {formatDateDE(weekDates[6])}. Wechsle zwischen A- und B-Platz.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border bg-background" role="group" aria-label="Platz wählen">
            <button
              type="button"
              className={`px-3 py-1.5 text-sm font-medium rounded-l-md border-r ${
                fieldView === "a-platz" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setFieldView("a-platz")}
            >
              A-Platz
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-sm font-medium rounded-r-md ${
                fieldView === "b-platz" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setFieldView("b-platz")}
            >
              B-Platz
            </button>
          </div>
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-40" data-testid="filter-team">
              <SelectValue placeholder="Mannschaft" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Mannschaften</SelectItem>
              {TEAMS.map((team) => (
                <SelectItem key={team} value={team}>
                  {TEAM_LABELS[team]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={goToToday} data-testid="button-today">
            Heute
          </Button>
          <Button variant="outline" size="icon" onClick={goToPrevWeek} data-testid="button-prev-week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextWeek} data-testid="button-next-week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              {conflicts.length} Konflikt{conflicts.length !== 1 ? "e" : ""} diese Woche
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {conflicts.map((conflict, i) => (
              <div key={i} className="py-1">
                <span className="font-medium">{conflict.event1.title}</span>
                {" & "}
                <span className="font-medium">{conflict.event2.title}</span>
                {" - "}
                <span className="text-muted-foreground">
                  {new Date(conflict.event1.date).toLocaleDateString("de-DE")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{FIELD_LABELS[fieldView]}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 min-w-0 overflow-x-auto">
          <div
            className="grid gap-0.5 mb-1 w-full"
            style={{ gridTemplateColumns: "auto repeat(7, minmax(0, 1fr))" }}
          >
            <div className="text-[10px] text-muted-foreground py-1 pr-1 text-right" />
            {weekDates.map((date, i) => {
              const dateStr = formatDate(date);
              const hasConflict = conflictDates.has(dateStr);
              const isToday = dateStr === today;
              return (
                <div
                  key={i}
                  className={`
                    text-center text-[10px] font-medium py-1 px-0.5 rounded
                    ${isToday ? "bg-primary text-primary-foreground" : ""}
                    ${hasConflict ? "ring-1 ring-destructive" : ""}
                  `}
                >
                  <div>{WEEKDAYS_SHORT[i]}</div>
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
                    style={{ height: ROW_HEIGHT }}
                  >
                    {hour}:00
                  </div>
                ))}
              </div>
              {weekDates.map((date, dayIndex) => {
                const dateStr = formatDate(date);
                const key = `${fieldView}-${dateStr}`;
                const dayEvents = eventsByFieldAndDate.get(key) || [];
                return (
                  <div
                    key={dayIndex}
                    className="relative bg-muted/30 rounded min-w-0"
                    style={{ height: HOURS.length * ROW_HEIGHT }}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-muted/60"
                        style={{ top: `${(hour - 8) * ROW_HEIGHT}px` }}
                      />
                    ))}
                    {dayEvents.map((event) => {
                      const { top, height } = getEventPosition(event);
                      const hasConflict = conflicts.some(
                        (c) => c.event1.id === event.id || c.event2.id === event.id
                      );
                      const colorClass = event.isPending
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-dashed border-gray-400"
                        : event.team
                          ? getTeamEventColorClass(event.team, event.type)
                          : `${EVENT_TYPE_COLORS[event.type]} text-white`;
                      return (
                        <div
                          key={event.id}
                          className={`
                            absolute left-0.5 right-0.5 rounded p-0.5 text-[10px] overflow-hidden cursor-pointer
                            ${colorClass}
                            ${hasConflict ? "ring-2 ring-destructive" : ""}
                            ${event.isPending ? "opacity-70" : ""}
                          `}
                          style={{ top: `${top}px`, height: `${height}px` }}
                          title={`${event.isPending ? "⏳ Vorschlag (ausstehend)\n" : ""}${event.title}\n${event.startTime} - ${event.endTime}${event.team ? `\n${TEAM_LABELS[event.team]}` : ""}`}
                          data-testid={`field-event-${event.id}`}
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="font-medium truncate leading-tight">
                            {event.isPending ? "⏳ " : ""}{event.title}
                          </div>
                          {height > 22 && (
                            <div className="truncate opacity-80 leading-tight">
                              {event.startTime}-{event.endTime}
                            </div>
                          )}
                          {height > 38 && event.team && (
                            <div className="truncate opacity-80 leading-tight">{TEAM_LABELS[event.team]}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 pt-4 border-t">
        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Mannschaftsfarben</h4>
        <p className="text-xs text-muted-foreground mb-2">Kräftig = Spiel · Hell mit Rand = Training</p>
        <div className="flex flex-wrap gap-2">
          {TEAMS.map((team) => (
            <span key={team} className="inline-flex items-center gap-1">
              <Badge className={TEAM_COLORS_SPIEL[team]}>Spiel</Badge>
              <Badge className={TEAM_COLORS_TRAINING[team]}>Training</Badge>
              <span className="text-xs text-muted-foreground mr-2">{TEAM_LABELS[team]}</span>
            </span>
          ))}
        </div>
      </div>

      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedEvent.title}</DialogTitle>
              <DialogDescription>
                {selectedEvent.date} · {selectedEvent.startTime} – {selectedEvent.endTime} ·{" "}
                {selectedEvent.field ? FIELD_LABELS[selectedEvent.field] : "kein Platz gesetzt"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {selectedEvent.isPending && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-yellow-800 dark:text-yellow-300 text-xs">
                  ⏳ Ausstehender Vorschlag – noch nicht freigegeben
                </div>
              )}
              {selectedEvent.team && (
                <div>
                  <span className="font-medium">Mannschaft: </span>
                  <span>{TEAM_LABELS[selectedEvent.team]}</span>
                </div>
              )}
              <div>
                <span className="font-medium">Typ: </span>
                <span>{EVENT_TYPE_LABELS[selectedEvent.type]}</span>
              </div>
              {selectedEvent.location && (
                <div>
                  <span className="font-medium">Ort: </span>
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              {selectedEvent.competition && (
                <div>
                  <span className="font-medium">Wettbewerb: </span>
                  <span>{selectedEvent.competition}</span>
                </div>
              )}
              {selectedEvent.description && (
                <div>
                  <span className="font-medium">Beschreibung: </span>
                  <span>{selectedEvent.description}</span>
                </div>
              )}
              {selectedEvent.bfvImported && (
                <Badge variant="outline" className="mt-2">
                  BFV-importiert
                </Badge>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { CalendarEvent } from "@shared/schema";
import { 
  EVENT_TYPE_LABELS, 
  EVENT_TYPE_COLORS,
  TEAMS,
  TEAM_LABELS,
  FIELDS, 
  FIELD_LABELS 
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
  return date.toISOString().split("T")[0];
}

function formatDateDE(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

export default function FieldsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [filterTeam, setFilterTeam] = useState<string>("all");

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const startDate = formatDate(weekDates[0]);
  const endDate = formatDate(weekDates[6]);

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: conflicts = [] } = useQuery<{ event1: CalendarEvent; event2: CalendarEvent; reason: string }[]>({
    queryKey: ["/api/calendar/conflicts", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/conflicts?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch conflicts");
      return res.json();
    },
  });

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filterTeam !== "all" && event.team !== filterTeam) return false;
      return true;
    });
  }, [events, filterTeam]);

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
    
    const top = ((startHour - 7) * 60 + startMin) * (48 / 60);
    const height = ((endHour - startHour) * 60 + (endMin - startMin)) * (48 / 60);
    
    return { top, height: Math.max(height, 24) };
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
          <p className="text-muted-foreground">
            KW {getWeekNumber(weekDates[0])} | {formatDateDE(weekDates[0])} - {formatDateDE(weekDates[6])}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {FIELDS.map((field) => (
          <Card key={field}>
            <CardHeader>
              <CardTitle className="text-lg">{FIELD_LABELS[field]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-8 gap-1 mb-2">
                    <div className="text-xs text-muted-foreground" />
                    {weekDates.map((date, i) => {
                      const dateStr = formatDate(date);
                      const hasConflict = conflictDates.has(dateStr);
                      const isToday = dateStr === today;
                      
                      return (
                        <div
                          key={i}
                          className={`
                            text-center text-xs font-medium p-2 rounded
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
                      
                      {weekDates.map((date, dayIndex) => {
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
                                className="absolute w-full border-t border-muted"
                                style={{ top: `${(hour - 7) * 48}px` }}
                              />
                            ))}
                            
                            {dayEvents.map((event) => {
                              const { top, height } = getEventPosition(event);
                              const hasConflict = conflicts.some(
                                (c) => c.event1.id === event.id || c.event2.id === event.id
                              );
                              
                              return (
                                <div
                                  key={event.id}
                                  className={`
                                    absolute left-0.5 right-0.5 rounded p-1 text-xs text-white overflow-hidden
                                    ${EVENT_TYPE_COLORS[event.type]}
                                    ${hasConflict ? "ring-2 ring-destructive" : ""}
                                  `}
                                  style={{ top: `${top}px`, height: `${height}px` }}
                                  title={`${event.title}\n${event.startTime} - ${event.endTime}${event.team ? `\n${TEAM_LABELS[event.team]}` : ""}`}
                                  data-testid={`field-event-${event.id}`}
                                >
                                  <div className="font-medium truncate">{event.title}</div>
                                  {height > 30 && (
                                    <div className="truncate opacity-80">
                                      {event.startTime} - {event.endTime}
                                    </div>
                                  )}
                                  {height > 50 && event.team && (
                                    <div className="truncate opacity-80">
                                      {TEAM_LABELS[event.team]}
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
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <span className="text-sm text-muted-foreground mr-2">Legende:</span>
        {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded ${EVENT_TYPE_COLORS[type as keyof typeof EVENT_TYPE_COLORS]}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
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

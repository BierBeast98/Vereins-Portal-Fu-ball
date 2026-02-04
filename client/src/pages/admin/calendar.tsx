import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Download, 
  AlertTriangle,
  Trash2,
  ArrowLeft
} from "lucide-react";
import type { 
  CalendarEvent, 
  EventType, 
  Team, 
  Field,
  InsertCalendarEvent 
} from "@shared/schema";
import { 
  EVENT_TYPES, 
  EVENT_TYPE_LABELS, 
  EVENT_TYPE_COLORS,
  TEAMS, 
  TEAM_LABELS, 
  FIELDS, 
  FIELD_LABELS 
} from "@shared/schema";

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

const WEEKDAY_LETTERS = ["M", "D", "M", "D", "F", "S", "S"];

function formatDate(date: Date): string {
  // Use local date formatting to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

interface EventFormData {
  title: string;
  type: EventType;
  team?: Team;
  field?: Field;
  date: string;
  startTime: string;
  endTime: string;
  isHomeGame: boolean;
  opponent: string;
  location: string;
  competition: string;
  description: string;
  isRecurring: boolean;
  recurringEndDate: string;
}

const WEEKDAY_NAMES_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function EventDialog({ 
  event, 
  onClose, 
  selectedDate 
}: { 
  event?: CalendarEvent; 
  onClose: () => void;
  selectedDate?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const defaultDate = event?.date || selectedDate || formatDate(new Date());
  const [formData, setFormData] = useState<EventFormData>({
    title: event?.title || "",
    type: event?.type || "training",
    team: event?.team,
    field: event?.field,
    date: defaultDate,
    startTime: event?.startTime || "18:00",
    endTime: event?.endTime || "20:00",
    isHomeGame: event?.isHomeGame ?? true,
    opponent: event?.opponent || "",
    location: event?.location || "",
    competition: event?.competition || "",
    description: event?.description || "",
    isRecurring: false,
    recurringEndDate: "",
  });

  // Calculate weekday name for selected date
  const selectedWeekday = useMemo(() => {
    if (!formData.date) return "";
    const [year, month, day] = formData.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return WEEKDAY_NAMES_DE[date.getDay()];
  }, [formData.date]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertCalendarEvent) => {
      return apiRequest("POST", "/api/calendar/events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Termin erstellt" });
      onClose();
    },
    onError: () => {
      toast({ title: "Fehler beim Erstellen", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<InsertCalendarEvent>) => {
      return apiRequest("PATCH", `/api/calendar/events/${event!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Termin aktualisiert" });
      onClose();
    },
    onError: () => {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/calendar/events/${event!.id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Termin gelöscht" });
      onClose();
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    },
  });

  // Generate all dates for recurring events
  const generateRecurringDates = (startDate: string, endDate: string): string[] => {
    const dates: string[] = [];
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    const targetWeekday = start.getDay();
    
    let current = new Date(start);
    while (current <= end) {
      if (current.getDay() === targetWeekday) {
        dates.push(formatDate(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const createRecurringMutation = useMutation({
    mutationFn: async (events: InsertCalendarEvent[]) => {
      // Create all events in sequence
      for (const eventData of events) {
        await apiRequest("POST", "/api/calendar/events", eventData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Wiederkehrende Termine erstellt" });
      onClose();
    },
    onError: () => {
      toast({ title: "Fehler beim Erstellen", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const baseData: InsertCalendarEvent = {
      title: formData.title,
      type: formData.type,
      team: formData.team,
      field: formData.field,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      isHomeGame: formData.type === "spiel" ? formData.isHomeGame : undefined,
      opponent: formData.type === "spiel" ? formData.opponent : undefined,
      location: formData.location || undefined,
      competition: formData.competition || undefined,
      description: formData.description || undefined,
      bfvImported: false,
    };

    if (event) {
      updateMutation.mutate(baseData);
    } else if (formData.isRecurring && formData.recurringEndDate) {
      // Generate all recurring dates and create events
      const dates = generateRecurringDates(formData.date, formData.recurringEndDate);
      const events = dates.map(date => ({ ...baseData, date }));
      if (events.length > 0) {
        createRecurringMutation.mutate(events);
      }
    } else {
      createMutation.mutate(baseData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || createRecurringMutation.isPending;

  // Calculate how many recurring events will be created
  const recurringCount = useMemo(() => {
    if (!formData.isRecurring || !formData.recurringEndDate || !formData.date) return 0;
    return generateRecurringDates(formData.date, formData.recurringEndDate).length;
  }, [formData.isRecurring, formData.date, formData.recurringEndDate]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="z.B. Herren Training"
            required
            data-testid="input-event-title"
          />
        </div>

        <div>
          <Label htmlFor="type">Terminart</Label>
          <Select
            value={formData.type}
            onValueChange={(value: EventType) => setFormData({ ...formData, type: value })}
          >
            <SelectTrigger data-testid="select-event-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {EVENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="team">Mannschaft</Label>
          <Select
            value={formData.team || "none"}
            onValueChange={(value) => setFormData({ ...formData, team: value === "none" ? undefined : value as Team })}
          >
            <SelectTrigger data-testid="select-event-team">
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine</SelectItem>
              {TEAMS.map((team) => (
                <SelectItem key={team} value={team}>
                  {TEAM_LABELS[team]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="field">Platz</Label>
          <Select
            value={formData.field || "none"}
            onValueChange={(value) => setFormData({ ...formData, field: value === "none" ? undefined : value as Field })}
          >
            <SelectTrigger data-testid="select-event-field">
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Kein Platz</SelectItem>
              {FIELDS.map((field) => (
                <SelectItem key={field} value={field}>
                  {FIELD_LABELS[field]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="date">Datum</Label>
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
            data-testid="input-event-date"
          />
        </div>

        <div>
          <Label htmlFor="startTime">Startzeit</Label>
          <Input
            id="startTime"
            type="time"
            value={formData.startTime}
            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            required
            data-testid="input-event-start"
          />
        </div>

        <div>
          <Label htmlFor="endTime">Endzeit</Label>
          <Input
            id="endTime"
            type="time"
            value={formData.endTime}
            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
            required
            data-testid="input-event-end"
          />
        </div>

        {/* Recurring event options - only show for new events, not for editing */}
        {!event && (
          <div className="col-span-2 border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-3 mb-2">
              <Switch
                id="isRecurring"
                checked={formData.isRecurring}
                onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: checked })}
                data-testid="switch-recurring"
              />
              <Label htmlFor="isRecurring" className="font-medium">
                Wiederkehrender Termin
              </Label>
            </div>
            
            {formData.isRecurring && (
              <div className="space-y-2 mt-3">
                <p className="text-sm text-muted-foreground">
                  Jeden <span className="font-semibold text-foreground">{selectedWeekday}</span> wiederholen bis:
                </p>
                <Input
                  id="recurringEndDate"
                  type="date"
                  value={formData.recurringEndDate}
                  onChange={(e) => setFormData({ ...formData, recurringEndDate: e.target.value })}
                  min={formData.date}
                  required={formData.isRecurring}
                  data-testid="input-recurring-end"
                />
                {recurringCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Es werden <span className="font-semibold text-primary">{recurringCount} Termine</span> erstellt.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {formData.type === "spiel" && (
          <>
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                id="isHomeGame"
                checked={formData.isHomeGame}
                onCheckedChange={(checked) => setFormData({ ...formData, isHomeGame: checked })}
                data-testid="switch-home-game"
              />
              <Label htmlFor="isHomeGame">Heimspiel</Label>
            </div>

            <div>
              <Label htmlFor="opponent">Gegner</Label>
              <Input
                id="opponent"
                value={formData.opponent}
                onChange={(e) => setFormData({ ...formData, opponent: e.target.value })}
                placeholder="z.B. FC Musterstadt"
                data-testid="input-opponent"
              />
            </div>

            <div>
              <Label htmlFor="competition">Wettbewerb</Label>
              <Input
                id="competition"
                value={formData.competition}
                onChange={(e) => setFormData({ ...formData, competition: e.target.value })}
                placeholder="z.B. Kreisliga"
                data-testid="input-competition"
              />
            </div>
          </>
        )}

        {!formData.isHomeGame && formData.type === "spiel" && (
          <div className="col-span-2">
            <Label htmlFor="location">Spielort</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Adresse des Spielorts"
              data-testid="input-location"
            />
          </div>
        )}

        <div className="col-span-2">
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optionale Beschreibung..."
            rows={2}
            data-testid="input-description"
          />
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-4">
        {event && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={isPending}
            data-testid="button-delete-event"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Löschen
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-event">
            {event ? "Speichern" : "Erstellen"}
          </Button>
        </div>
      </div>
    </form>
  );
}

type ViewMode = "year" | "month" | "day";

export default function CalendarPage() {
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear}-12-31`;

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
    return events.filter((event) => {
      if (filterTeam !== "all" && event.team !== filterTeam) return false;
      if (filterType !== "all" && event.type !== filterType) return false;
      return true;
    });
  }, [events, filterTeam, filterType]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const existing = map.get(event.date) || [];
      existing.push(event);
      map.set(event.date, existing);
    });
    return map;
  }, [filteredEvents]);

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/calendar/export?startDate=${startDate}&endDate=${endDate}&format=csv`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kalender-${currentYear}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({ title: "Export erfolgreich" });
    } catch (error) {
      toast({ title: "Export fehlgeschlagen", variant: "destructive" });
    }
  };

  const handleDayClick = (dateStr: string, month: number) => {
    if (viewMode === "year") {
      setSelectedMonth(month);
      setViewMode("month");
    } else if (viewMode === "month") {
      const dayEvents = eventsByDate.get(dateStr) || [];
      if (dayEvents.length === 0) {
        setSelectedDate(dateStr);
        setEditingEvent(undefined);
        setDialogOpen(true);
      } else if (dayEvents.length === 1) {
        setEditingEvent(dayEvents[0]);
        setSelectedDate(undefined);
        setDialogOpen(true);
      } else {
        setSelectedDate(dateStr);
        setViewMode("day");
      }
    }
  };

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEvent(event);
    setSelectedDate(undefined);
    setDialogOpen(true);
  };

  const openCreateDialog = (date?: string) => {
    setEditingEvent(undefined);
    setSelectedDate(date);
    setDialogOpen(true);
  };

  const goBack = () => {
    if (viewMode === "day") {
      setViewMode("month");
    } else if (viewMode === "month") {
      setViewMode("year");
    }
  };

  const today = formatDate(new Date());
  const todayDate = new Date();

  const getEventColorClass = (event: CalendarEvent): string => {
    // Use team color if team is specified, otherwise fall back to event type color
    if (event.team) {
      const teamColors: Record<string, string> = {
        "herren": "bg-blue-600 text-white",
        "herren2": "bg-blue-400 text-white",
        "damen": "bg-pink-500 text-white",
        "a-jugend": "bg-emerald-600 text-white",
        "b-jugend": "bg-emerald-500 text-white",
        "c-jugend": "bg-teal-500 text-white",
        "d-jugend": "bg-cyan-500 text-white",
        "e-jugend": "bg-amber-500 text-white",
        "f-jugend": "bg-orange-400 text-white",
        "g-jugend": "bg-yellow-500 text-gray-900",
        "alte-herren": "bg-slate-500 text-white",
      };
      return teamColors[event.team] || "bg-gray-500 text-white";
    }
    
    // Fall back to event type colors for events without a team
    const typeColors: Record<EventType, string> = {
      spiel: "bg-blue-500 text-white",
      training: "bg-green-500 text-white",
      turnier: "bg-purple-500 text-white",
      vereinsevent: "bg-orange-500 text-white",
      platzsperrung: "bg-red-500 text-white",
      sonstiges: "bg-gray-500 text-white",
    };
    return typeColors[event.type];
  };

  const getTeamShortLabel = (team?: string): string => {
    if (!team) return "";
    const shortLabels: Record<string, string> = {
      "herren": "H1",
      "herren2": "H2",
      "a-jugend": "A",
      "b-jugend": "B",
      "c-jugend": "C",
      "d-jugend": "D",
      "e-jugend": "E",
      "f-jugend": "F",
      "g-jugend": "G",
      "damen": "D♀",
      "alte-herren": "AH",
    };
    return shortLabels[team] || "";
  };

  const getEventDisplayLabel = (event: CalendarEvent): string => {
    const teamShort = getTeamShortLabel(event.team);
    const awayMarker = event.type === "spiel" && event.isHomeGame === false ? "(A)" : "";
    if (teamShort) {
      return `[${teamShort}]${awayMarker} ${event.title}`;
    }
    return awayMarker ? `${awayMarker} ${event.title}` : event.title;
  };
  
  const isAwayGame = (event: CalendarEvent): boolean => {
    return event.type === "spiel" && event.isHomeGame === false;
  };

  const renderYearView = () => {
    const monthsFirstHalf = [0, 1, 2, 3, 4, 5];
    const monthsSecondHalf = [6, 7, 8, 9, 10, 11];

    const renderMonthColumn = (month: number) => {
      const days = getDaysInMonth(currentYear, month);
      let lastWeek = -1;

      return (
        <div key={month} className="flex-1 min-w-0">
          <div className="text-center font-semibold text-sm py-1 border-b bg-muted">
            {MONTHS_DE[month]} {currentYear}
          </div>
          <div className="text-xs">
            {days.map((date) => {
              const dateStr = formatDate(date);
              const dayOfWeek = date.getDay();
              const weekdayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
              const weekNum = getWeekNumber(date);
              const showWeekNum = weekNum !== lastWeek && (dayOfWeek === 0 || date.getDate() === 1);
              lastWeek = weekNum;

              const dayEvents = eventsByDate.get(dateStr) || [];
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isToday = dateStr === today;
              const hasConflict = conflicts.some(
                (c) => c.event1.date === dateStr || c.event2.date === dateStr
              );

              const primaryEvent = dayEvents[0];

              return (
                <div
                  key={dateStr}
                  className={`
                    flex items-center px-1 py-0.5 cursor-pointer border-b border-border/50
                    ${isWeekend ? "bg-muted/50" : ""}
                    ${isToday ? "bg-primary/20 font-bold" : ""}
                    ${hasConflict ? "ring-1 ring-destructive ring-inset" : ""}
                    hover:bg-accent/50 transition-colors
                  `}
                  onClick={() => handleDayClick(dateStr, month)}
                  data-testid={`day-${dateStr}`}
                >
                  <span className="w-4 text-muted-foreground">{WEEKDAY_LETTERS[weekdayIndex]}</span>
                  <span className={`w-5 text-right ${isToday ? "text-primary font-bold" : ""}`}>
                    {date.getDate()}
                  </span>
                  <span className="flex-1 ml-1 flex items-center gap-0.5 min-w-0">
                    {primaryEvent && (
                      <span 
                        className={`text-xs px-1 rounded truncate ${getEventColorClass(primaryEvent)} ${isAwayGame(primaryEvent) ? "italic border border-current" : ""}`}
                        onClick={(e) => handleEventClick(primaryEvent, e)}
                      >
                        {(() => {
                          const label = getEventDisplayLabel(primaryEvent);
                          return label.length > 15 ? label.substring(0, 15) + "…" : label;
                        })()}
                      </span>
                    )}
                    {dayEvents.length > 1 && (
                      <span className="flex-shrink-0 text-xs font-semibold bg-orange-500 text-white px-1 rounded">
                        +{dayEvents.length - 1}
                      </span>
                    )}
                  </span>
                  {showWeekNum && (
                    <span className="w-6 text-right text-muted-foreground font-medium">{weekNum}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex gap-1 overflow-x-auto">
          {monthsFirstHalf.map(renderMonthColumn)}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {monthsSecondHalf.map(renderMonthColumn)}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const days = getDaysInMonth(currentYear, selectedMonth);
    let lastWeek = -1;

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={goBack} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zur Jahresübersicht
            </Button>
            <CardTitle>{MONTHS_DE[selectedMonth]} {currentYear}</CardTitle>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (selectedMonth === 0) {
                    setCurrentYear(currentYear - 1);
                    setSelectedMonth(11);
                  } else {
                    setSelectedMonth(selectedMonth - 1);
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (selectedMonth === 11) {
                    setCurrentYear(currentYear + 1);
                    setSelectedMonth(0);
                  } else {
                    setSelectedMonth(selectedMonth + 1);
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {days.map((date) => {
              const dateStr = formatDate(date);
              const dayOfWeek = date.getDay();
              const weekdayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
              const weekNum = getWeekNumber(date);
              const showWeekNum = weekNum !== lastWeek;
              lastWeek = weekNum;

              const dayEvents = eventsByDate.get(dateStr) || [];
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isToday = dateStr === today;
              const hasConflict = conflicts.some(
                (c) => c.event1.date === dateStr || c.event2.date === dateStr
              );

              return (
                <div
                  key={dateStr}
                  className={`
                    flex items-center p-2 rounded-md cursor-pointer
                    ${isWeekend ? "bg-muted/50" : ""}
                    ${isToday ? "bg-primary/20 ring-2 ring-primary" : ""}
                    ${hasConflict ? "ring-2 ring-destructive" : ""}
                    hover:bg-accent/50 transition-colors
                  `}
                  onClick={() => handleDayClick(dateStr, selectedMonth)}
                  data-testid={`month-day-${dateStr}`}
                >
                  <span className="w-8 font-medium text-muted-foreground">
                    {["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][dayOfWeek]}
                  </span>
                  <span className={`w-8 font-bold ${isToday ? "text-primary" : ""}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {dayEvents.map((event) => (
                      <Badge
                        key={event.id}
                        className={`${getEventColorClass(event)} cursor-pointer ${isAwayGame(event) ? "italic border border-current" : ""}`}
                        onClick={(e) => handleEventClick(event, e)}
                        data-testid={`event-badge-${event.id}`}
                      >
                        {event.team && <span className="font-bold mr-1">[{getTeamShortLabel(event.team)}]{isAwayGame(event) ? "(A)" : ""}</span>}
                        {event.startTime} {event.title}
                      </Badge>
                    ))}
                    {dayEvents.length === 0 && (
                      <span className="text-muted-foreground text-sm">Klicken um Termin zu erstellen</span>
                    )}
                  </div>
                  {showWeekNum && (
                    <span className="w-12 text-right text-muted-foreground">KW {weekNum}</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDayView = () => {
    if (!selectedDate) return null;
    const dayEvents = eventsByDate.get(selectedDate) || [];
    const date = new Date(selectedDate);

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={goBack} data-testid="button-back-day">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zum Monat
            </Button>
            <CardTitle>
              {date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </CardTitle>
            <Button onClick={() => openCreateDialog(selectedDate)} data-testid="button-add-event-day">
              <Plus className="h-4 w-4 mr-2" />
              Neuer Termin
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dayEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Keine Termine an diesem Tag</p>
              <Button className="mt-4" onClick={() => openCreateDialog(selectedDate)}>
                <Plus className="h-4 w-4 mr-2" />
                Termin erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <div
                  key={event.id}
                  className={`p-3 rounded-md cursor-pointer hover-elevate ${getEventColorClass(event)} ${isAwayGame(event) ? "border-2 border-dashed border-current" : ""}`}
                  onClick={() => {
                    setEditingEvent(event);
                    setDialogOpen(true);
                  }}
                  data-testid={`day-event-${event.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${isAwayGame(event) ? "italic" : ""}`}>
                      {isAwayGame(event) && <span className="mr-1">(A)</span>}
                      {event.title}
                    </span>
                    <span>{event.startTime} - {event.endTime}</span>
                  </div>
                  {event.team && (
                    <div className="text-sm opacity-90">{TEAM_LABELS[event.team]}</div>
                  )}
                  {event.opponent && (
                    <div className="text-sm opacity-90">
                      {event.isHomeGame ? "Heim" : "Auswärts"} vs {event.opponent}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {viewMode === "year" ? `Jahreskalender ${currentYear}` : 
             viewMode === "month" ? `${MONTHS_DE[selectedMonth]} ${currentYear}` :
             "Tagesansicht"}
          </h1>
          <p className="text-muted-foreground">
            {events.length} Termine | {conflicts.length} Konflikte
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40" data-testid="filter-type">
              <SelectValue placeholder="Terminart" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Arten</SelectItem>
              {EVENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {EVENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleExport} data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openCreateDialog()} data-testid="button-add-event">
                <Plus className="h-4 w-4 mr-2" />
                Neuer Termin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingEvent ? "Termin bearbeiten" : "Neuer Termin"}
                </DialogTitle>
                <DialogDescription>
                  {editingEvent ? "Bearbeiten Sie die Termindetails" : "Erstellen Sie einen neuen Termin im Kalender"}
                </DialogDescription>
              </DialogHeader>
              <EventDialog 
                event={editingEvent} 
                onClose={() => setDialogOpen(false)}
                selectedDate={selectedDate}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === "year" && (
        <div className="flex items-center justify-center gap-4 mb-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentYear(currentYear - 1)}
            data-testid="button-prev-year"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xl font-semibold min-w-20 text-center">{currentYear}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentYear(currentYear + 1)}
            data-testid="button-next-year"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {conflicts.length > 0 && viewMode === "year" && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {conflicts.length} Konflikt{conflicts.length !== 1 ? "e" : ""} gefunden
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {conflicts.slice(0, 5).map((conflict, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{conflict.event1.title}</span>
                  {" & "}
                  <span className="font-medium">{conflict.event2.title}</span>
                  {" - "}
                  <span className="text-muted-foreground">{conflict.reason}</span>
                </div>
              ))}
              {conflicts.length > 5 && (
                <p className="text-sm text-muted-foreground">
                  ... und {conflicts.length - 5} weitere
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "year" && renderYearView()}
      {viewMode === "month" && renderMonthView()}
      {viewMode === "day" && renderDayView()}
      
      {/* Team color legend */}
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Mannschaftsfarben</h4>
        <div className="flex flex-wrap gap-2">
          {TEAMS.map((team) => {
            const teamColors: Record<string, string> = {
              "herren": "bg-blue-600",
              "herren2": "bg-blue-400",
              "damen": "bg-pink-500",
              "a-jugend": "bg-emerald-600",
              "b-jugend": "bg-emerald-500",
              "c-jugend": "bg-teal-500",
              "d-jugend": "bg-cyan-500",
              "e-jugend": "bg-amber-500",
              "f-jugend": "bg-orange-400",
              "g-jugend": "bg-yellow-500",
              "alte-herren": "bg-slate-500",
            };
            const textColor = team === "g-jugend" ? "text-gray-900" : "text-white";
            return (
              <Badge 
                key={team} 
                className={`${teamColors[team]} ${textColor}`}
                data-testid={`legend-team-${team}`}
              >
                {TEAM_LABELS[team]}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}

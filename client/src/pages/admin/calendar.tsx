import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  Edit
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

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  
  const days: (Date | null)[] = [];
  
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }
  
  return days;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
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
}

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
  
  const [formData, setFormData] = useState<EventFormData>({
    title: event?.title || "",
    type: event?.type || "training",
    team: event?.team,
    field: event?.field,
    date: event?.date || selectedDate || formatDate(new Date()),
    startTime: event?.startTime || "18:00",
    endTime: event?.endTime || "20:00",
    isHomeGame: event?.isHomeGame ?? true,
    opponent: event?.opponent || "",
    location: event?.location || "",
    competition: event?.competition || "",
    description: event?.description || "",
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data: InsertCalendarEvent = {
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
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

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

export default function CalendarPage() {
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear}-12-31`;

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

  const openCreateDialog = (date?: string) => {
    setEditingEvent(undefined);
    setSelectedDate(date);
    setDialogOpen(true);
  };

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setSelectedDate(undefined);
    setDialogOpen(true);
  };

  const today = formatDate(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Jahreskalender {currentYear}</h1>
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

      {conflicts.length > 0 && (
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, month) => {
          const days = getMonthDays(currentYear, month);
          const monthEvents = filteredEvents.filter((e) => {
            const eventDate = new Date(e.date);
            return eventDate.getMonth() === month && eventDate.getFullYear() === currentYear;
          });

          return (
            <Card 
              key={month} 
              className={`cursor-pointer transition-shadow hover-elevate ${selectedMonth === month ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedMonth(selectedMonth === month ? null : month)}
              data-testid={`month-${month}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {MONTHS_DE[month]}
                  {monthEvents.length > 0 && (
                    <Badge variant="secondary">{monthEvents.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-7 gap-0.5 text-xs">
                  {WEEKDAYS_DE.map((day) => (
                    <div key={day} className="text-center text-muted-foreground font-medium p-1">
                      {day}
                    </div>
                  ))}
                  {days.map((date, i) => {
                    if (!date) {
                      return <div key={`empty-${i}`} className="p-1" />;
                    }
                    
                    const dateStr = formatDate(date);
                    const dayEvents = eventsByDate.get(dateStr) || [];
                    const hasConflict = conflicts.some(
                      (c) => c.event1.date === dateStr || c.event2.date === dateStr
                    );
                    const isToday = dateStr === today;
                    
                    return (
                      <div
                        key={dateStr}
                        className={`
                          relative p-1 text-center rounded-sm cursor-pointer
                          ${isToday ? "bg-primary text-primary-foreground font-bold" : ""}
                          ${dayEvents.length > 0 && !isToday ? "bg-muted" : ""}
                          ${hasConflict ? "ring-1 ring-destructive" : ""}
                        `}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (dayEvents.length === 1) {
                            openEditDialog(dayEvents[0]);
                          } else if (dayEvents.length > 1) {
                            setSelectedMonth(month);
                          } else {
                            openCreateDialog(dateStr);
                          }
                        }}
                        data-testid={`day-${dateStr}`}
                      >
                        {date.getDate()}
                        {dayEvents.length > 0 && (
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {dayEvents.slice(0, 3).map((ev, j) => (
                              <div
                                key={j}
                                className={`w-1 h-1 rounded-full ${EVENT_TYPE_COLORS[ev.type]}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedMonth !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Termine im {MONTHS_DE[selectedMonth]}</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEvents
              .filter((e) => {
                const eventDate = new Date(e.date);
                return eventDate.getMonth() === selectedMonth && eventDate.getFullYear() === currentYear;
              })
              .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
              .map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 rounded-md hover-elevate cursor-pointer border-b last:border-0"
                  onClick={() => openEditDialog(event)}
                  data-testid={`event-${event.id}`}
                >
                  <div className={`w-3 h-3 rounded-full ${EVENT_TYPE_COLORS[event.type]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{event.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(event.date).toLocaleDateString("de-DE")} | {event.startTime} - {event.endTime}
                      {event.team && ` | ${TEAM_LABELS[event.team]}`}
                      {event.field && ` | ${FIELD_LABELS[event.field]}`}
                    </div>
                  </div>
                  <Badge variant="outline">{EVENT_TYPE_LABELS[event.type]}</Badge>
                  <Button variant="ghost" size="icon" data-testid={`edit-event-${event.id}`}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            {filteredEvents.filter((e) => {
              const eventDate = new Date(e.date);
              return eventDate.getMonth() === selectedMonth && eventDate.getFullYear() === currentYear;
            }).length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                Keine Termine in diesem Monat
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {EVENT_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded-full ${EVENT_TYPE_COLORS[type]}`} />
            <span>{EVENT_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

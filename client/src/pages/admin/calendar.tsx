import { calendarWeek, shiftCalendarDate } from "@shared/calendar-week";
import { hasPermission, usePortalAuth } from "@/lib/portal-auth";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { visibleCalendarMonths } from "@shared/calendar-months";
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
import { MonthGrid } from "@/components/month-grid";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  AlertTriangle,
  Trash2,
  ArrowLeft,
  Repeat,
  RefreshCw,
  Home,
  MapPin,
  Trophy,
  ChevronDown,
  ChevronUp,
  Bus
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
  getTeamEventColorClass,
  TEAM_COLORS_SPIEL,
  TEAM_COLORS_TRAINING, 
  FIELDS, 
  FIELD_LABELS 
} from "@shared/schema";

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];


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

type DeleteTarget = { event: CalendarEvent; scope: "single" | "series" };

function DeleteCalendarEventDialog({ target, onClose, onDeleted }: { target: DeleteTarget; onClose: () => void; onDeleted?: () => void }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = usePortalAuth();
  const canDelete = hasPermission(auth, "calendar.write");
  const series = target.scope === "series" && Boolean(target.event.recurringGroupId);
  const mutation = useMutation({
    mutationFn: () => apiRequest("DELETE", series ? `/api/calendar/events/recurring/${encodeURIComponent(target.event.recurringGroupId!)}` : `/api/calendar/events/${encodeURIComponent(target.event.id)}`, {}),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["/api/calendar/events"] }), client.invalidateQueries({ queryKey: ["/api/calendar/conflicts"] }), client.invalidateQueries({ queryKey: ["/api/public/calendar/fields"] }), client.invalidateQueries({ queryKey: ["/api/public/training-schedule"] })]);
      toast({ title: series ? "Terminserie gelöscht" : "Termin gelöscht" });
      onClose(); onDeleted?.();
    },
  });
  return <AlertDialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{series ? "Gesamte Terminserie löschen?" : "Diesen Termin löschen?"}</AlertDialogTitle><AlertDialogDescription>{series ? "Alle Termine dieser Serie werden gelöscht, auch außerhalb des angezeigten Zeitraums." : "Dieser einzelne Termin wird dauerhaft aus dem Kalender gelöscht."}</AlertDialogDescription></AlertDialogHeader><div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm"><p className="wrap-anywhere font-semibold">{target.event.title}</p><p>{target.event.date.split("-").reverse().join(".")} · {target.event.startTime}–{target.event.endTime} Uhr</p>{target.event.team && <p>{TEAM_LABELS[target.event.team]}</p>}</div>{mutation.error && <p role="alert" className="text-sm text-destructive">Löschen fehlgeschlagen. Bitte versuche es erneut.</p>}<AlertDialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Abbrechen</Button><Button type="button" variant="destructive" disabled={mutation.isPending || !canDelete} onClick={() => mutation.mutate()} data-testid="button-confirm-delete-event">{mutation.isPending ? "Wird gelöscht …" : series ? "Gesamte Serie endgültig löschen" : "Termin endgültig löschen"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
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

  const [showRawData, setShowRawData] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"single" | "series" | null>(null);
  const { data: auth } = usePortalAuth();
  const canWrite = hasPermission(auth, "calendar.write");

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

  const updateRecurringGroupMutation = useMutation({
    mutationFn: async (data: Partial<InsertCalendarEvent>) => {
      return apiRequest("PATCH", `/api/calendar/events/recurring/${event!.recurringGroupId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Alle wiederkehrenden Termine aktualisiert" });
      onClose();
    },
    onError: () => {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
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
    if (!canWrite) return;
    
    const baseData: InsertCalendarEvent = {
      title: formData.title,
      type: formData.type,
      team: formData.team,
      field: formData.field ?? null,
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
      // Generate all recurring dates and create events with shared group ID
      const recurringGroupId = crypto.randomUUID();
      const dates = generateRecurringDates(formData.date, formData.recurringEndDate);
      const events = dates.map(date => ({ ...baseData, date, recurringGroupId }));
      if (events.length > 0) {
        createRecurringMutation.mutate(events);
      }
    } else {
      createMutation.mutate(baseData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || createRecurringMutation.isPending || updateRecurringGroupMutation.isPending;

  // Calculate how many recurring events will be created
  const recurringCount = useMemo(() => {
    if (!formData.isRecurring || !formData.recurringEndDate || !formData.date) return 0;
    return generateRecurringDates(formData.date, formData.recurringEndDate).length;
  }, [formData.isRecurring, formData.date, formData.recurringEndDate]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 min-w-0 flex flex-col">
      <fieldset disabled={!canWrite} className="min-w-0 space-y-4">

      {/* Game summary card – shown only when type is "spiel" */}
      {formData.type === "spiel" && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${formData.isHomeGame ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"}`}>
              {formData.isHomeGame ? <Home className="h-3.5 w-3.5" /> : <Bus className="h-3.5 w-3.5" />}
              {formData.isHomeGame ? "Heimspiel" : "Auswärtsspiel"}
            </span>
            {formData.competition && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Trophy className="h-3 w-3" />
                {formData.competition}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="font-semibold text-sm truncate text-right flex-1">
              {formData.isHomeGame
                ? (formData.team ? TEAM_LABELS[formData.team as Team] || formData.team : "Heimteam")
                : (formData.opponent || "Gegner")}
            </span>
            <span className="text-muted-foreground font-bold text-base shrink-0">VS</span>
            <span className="font-semibold text-sm truncate text-left flex-1">
              {formData.isHomeGame
                ? (formData.opponent || "Gegner")
                : (formData.team ? TEAM_LABELS[formData.team as Team] || formData.team : "Heimteam")}
            </span>
          </div>
          {formData.date && (
            <p className="text-center text-xs text-muted-foreground mt-1">
              {formData.date.split("-").reverse().join(".")}
              {formData.startTime && ` · ${formData.startTime}`}
              {formData.endTime && ` – ${formData.endTime}`}
              {!formData.isHomeGame && formData.location && (
                <span className="ml-1 inline-flex items-center gap-0.5"><MapPin className="h-3 w-3 inline" />{formData.location}</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Section: Grunddaten */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grunddaten</p>
        <div className="grid grid-cols-1 gap-3 min-w-0 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
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
          <div className="min-w-0">
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
          <div className="min-w-0">
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
          <div className="min-w-0">
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
        </div>
      </div>

      {/* Section: Zeit */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zeit</p>
        <div className="grid grid-cols-1 gap-3 min-w-0 sm:grid-cols-3">
          <div className="min-w-0">
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
          <div className="min-w-0">
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
          <div className="min-w-0">
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
        </div>
      </div>

      {/* Section: Spieldetails – only for "spiel" */}
      {formData.type === "spiel" && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spieldetails</p>

          {/* Home/Away segmented toggle */}
          <div className="flex flex-col rounded-md border border-input overflow-hidden w-full sm:flex-row" role="group" aria-label="Heim oder Auswärts">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isHomeGame: true })}
              data-testid="switch-home-game"
              className={`flex-1 min-h-11 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${formData.isHomeGame ? "bg-green-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <Home className="h-4 w-4" />
              Heimspiel
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isHomeGame: false })}
              className={`flex-1 min-h-11 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${!formData.isHomeGame ? "bg-orange-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <Bus className="h-4 w-4" />
              Auswärtsspiel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 min-w-0 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="opponent">Gegner</Label>
              <Input
                id="opponent"
                value={formData.opponent}
                onChange={(e) => setFormData({ ...formData, opponent: e.target.value })}
                placeholder="z.B. FC Musterstadt"
                data-testid="input-opponent"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="competition">Wettbewerb</Label>
              <Input
                id="competition"
                value={formData.competition}
                onChange={(e) => setFormData({ ...formData, competition: e.target.value })}
                placeholder="z.B. Kreisliga"
                data-testid="input-competition"
              />
            </div>
          </div>

          {!formData.isHomeGame && (
            <div className="min-w-0">
              <Label htmlFor="location">
                <MapPin className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                Spielort
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Adresse des Spielorts"
                data-testid="input-location"
              />
            </div>
          )}
        </div>
      )}

      {/* Section: Wiederkehrender Termin – only for new events */}
      {!event && (
        <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
          <div className="flex items-center gap-3">
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
            <div className="space-y-2 pt-1">
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

      {/* Section: Beschreibung */}
      <div className="space-y-1 min-w-0">
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

      </fieldset>

      {/* BFV Rohdaten – collapsible, collapsed by default */}
      {event?.bfvImported && event?.rawPayload != null && (
        <div className="rounded-lg border bg-muted/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRawData((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            <span className="font-medium">Rohdaten vom BFV</span>
            {showRawData ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showRawData && (
            <pre className="px-3 pb-3 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs" data-testid="raw-payload">
              {typeof event.rawPayload === "object"
                ? JSON.stringify(event.rawPayload, null, 2)
                : String(event.rawPayload)}
            </pre>
          )}
        </div>
      )}

      {/* Recurring series indicator */}
      {event?.recurringGroupId && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md text-sm text-blue-700 dark:text-blue-300">
          <Repeat className="h-4 w-4" />
          <span>Teil einer wiederkehrenden Serie</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap justify-between gap-2 pt-2 shrink-0 pb-2">
        {event && canWrite && (
          <div className="flex flex-wrap gap-2">
            {event.recurringGroupId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteScope("single")}
                  disabled={isPending}
                  data-testid="button-delete-event"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Nur diesen löschen
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteScope("series")}
                  disabled={isPending}
                  data-testid="button-delete-all-recurring"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Alle löschen
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteScope("single")}
                disabled={isPending}
                data-testid="button-delete-event"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Löschen
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {canWrite ? "Abbrechen" : "Schließen"}
          </Button>
          {canWrite && (event?.recurringGroupId ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateMutation.mutate({
                  title: formData.title,
                  type: formData.type,
                  team: formData.team,
                  field: formData.field ?? null,
                  date: formData.date,
                  startTime: formData.startTime,
                  endTime: formData.endTime,
                  isHomeGame: formData.type === "spiel" ? formData.isHomeGame : undefined,
                  opponent: formData.type === "spiel" ? formData.opponent : undefined,
                  location: formData.location || undefined,
                  competition: formData.competition || undefined,
                  description: formData.description || undefined,
                })}
                disabled={isPending}
                data-testid="button-save-event"
              >
                Nur diesen speichern
              </Button>
              <Button
                type="button"
                onClick={() => updateRecurringGroupMutation.mutate({
                  title: formData.title,
                  type: formData.type,
                  team: formData.team,
                  field: formData.field ?? null,
                  startTime: formData.startTime,
                  endTime: formData.endTime,
                  isHomeGame: formData.type === "spiel" ? formData.isHomeGame : undefined,
                  opponent: formData.type === "spiel" ? formData.opponent : undefined,
                  location: formData.location || undefined,
                  competition: formData.competition || undefined,
                  description: formData.description || undefined,
                })}
                disabled={isPending}
                data-testid="button-save-all-recurring"
              >
                Alle speichern
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={isPending} data-testid="button-save-event">
              {event ? "Speichern" : "Erstellen"}
            </Button>
          ))}
        </div>
      </div>
      {event && deleteScope && <DeleteCalendarEventDialog target={{ event, scope: deleteScope }} onClose={() => setDeleteScope(null)} onDeleted={onClose} />}
    </form>
  );
}

function BfvImportButton() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: status } = useQuery<{ running: boolean; bfvUrlConfigured: boolean }>({
    queryKey: ["/api/calendar/bfv-import/status"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/bfv-import/status", { credentials: "include" });
      if (!res.ok) throw new Error("Status fehlgeschlagen");
      return res.json();
    },
  });
  const importMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/calendar/bfv-import/run", {}),
    onSuccess: (data: { ok?: boolean; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/bfv-import/runs"] });
      if (data.ok) toast({ title: "BFV-Import abgeschlossen", description: data.message });
      else toast({ title: "BFV-Import fehlgeschlagen", description: data.message, variant: "destructive" });
    },
    onError: (err: Error) => toast({ title: "BFV-Import fehlgeschlagen", description: err.message, variant: "destructive" }),
  });
  const running = status?.running ?? false;
  const pending = importMutation.isPending;
  const disabled = !status?.bfvUrlConfigured || running || pending;
  return (
    <Button
      variant="outline"
      onClick={() => importMutation.mutate()}
      disabled={disabled}
      data-testid="button-bfv-import-now"
    >
      {pending || running ? (
        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4 mr-2" />
      )}
      BFV jetzt importieren
    </Button>
  );
}

type ViewMode = "year" | "month" | "week" | "day";

export default function CalendarPage() {
  const { toast } = useToast();
  const { data: auth } = usePortalAuth();
  const canWrite = hasPermission(auth, "calendar.write");
  const [weekAnchor, setWeekAnchor] = useState(formatDate(new Date()));
  const week = useMemo(() => calendarWeek(weekAnchor), [weekAnchor]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showPastMonths, setShowPastMonths] = useState(false);
  const [monthLayout, setMonthLayout] = useState<"games" | "agenda">("games");
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>();
  
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterField, setFilterField] = useState<string>("all");
  const [search, setSearch] = useState("");

  const startDate = viewMode === "week" ? week.start : `${currentYear}-01-01`;
  const endDate = viewMode === "week" ? week.end : `${currentYear}-12-31`;

  const { data: events = [], isLoading, error: eventsError, refetch: refetchEvents } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: conflicts = [], error: conflictsError } = useQuery<{ event1: CalendarEvent; event2: CalendarEvent; reason: string }[]>({
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
      if (filterField !== "all" && event.field !== filterField) return false;
      const text = [event.title, event.opponent, event.location, event.team && TEAM_LABELS[event.team]].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
      if (search.trim() && !text.includes(search.trim().toLocaleLowerCase("de-DE"))) return false;
      return true;
    });
  }, [events, filterTeam, filterType, filterField, search]);

  const visibleConflicts = useMemo(() => {
    const ids = new Set(filteredEvents.map(event => event.id));
    return conflicts.filter(c => ids.has(c.event1.id) || ids.has(c.event2.id));
  }, [conflicts, filteredEvents]);

  const conflictDates = useMemo(
    () => new Set(visibleConflicts.flatMap((c) => [c.event1.date, c.event2.date])),
    [visibleConflicts]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const existing = map.get(event.date) || [];
      existing.push(event);
      map.set(event.date, existing);
    });
    map.forEach(day => day.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title, "de")));
    return map;
  }, [filteredEvents]);

  function openWeek(date: string) {
    setWeekAnchor(date); setSelectedDate(date); setCurrentYear(Number(date.slice(0, 4))); setSelectedMonth(Number(date.slice(5, 7)) - 1); setViewMode("week");
  }
  function editEvent(event: CalendarEvent) {
    setEditingEvent(event); setSelectedDate(undefined); setDialogOpen(true);
  }

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
    if (viewMode === "month") {
      const dayEvents = eventsByDate.get(dateStr) || [];
      if (dayEvents.length === 0) {
        if (!canWrite) return;
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
    if (!canWrite) return;
    setEditingEvent(undefined);
    setSelectedDate(date);
    setDialogOpen(true);
  };

  const goBack = () => {
    if (viewMode === "day") {
      setViewMode("month");
    } else if (viewMode === "month" || viewMode === "week") {
      setViewMode("year");
    }
  };

  const today = formatDate(new Date());
  const todayDate = new Date();

  const typeColors: Record<EventType, string> = {
    spiel: "bg-blue-500 text-white",
    training: "bg-green-500 text-white",
    turnier: "bg-purple-500 text-white",
    vereinsevent: "bg-orange-500 text-white",
    platzsperrung: "bg-red-500 text-white",
    sonstiges: "bg-gray-500 text-white",
  };

  const getEventColorClass = (event: CalendarEvent): string => {
    const team = event.team;
    if (team && TEAMS.includes(team)) {
      const teamClass = getTeamEventColorClass(team, event.type);
      if (teamClass) return teamClass;
    }
    return typeColors[event.type] ?? typeColors.sonstiges;
  };

  const getTeamShortLabel = (team?: string): string => {
    if (!team) return "";
    const shortLabels: Record<string, string> = {
      "herren": "H1",
      "herren2": "H2",
      "a-jugend": "A",
      "a-jugend-2": "A2",
      "b-jugend": "B",
      "b-jugend-2": "B2",
      "c-jugend": "C",
      "c-jugend-2": "C2",
      "d-jugend": "D",
      "d-jugend-2": "D2",
      "e-jugend": "E",
      "e-jugend-2": "E2",
      "f-jugend": "F",
      "f-jugend-2": "F2",
      "g-jugend": "G",
      "g-jugend-2": "G2",
      "damen": "D♀",
      "alte-herren": "AH",
    };
    return shortLabels[team] || "";
  };

  const isAwayGame = (event: CalendarEvent): boolean => {
    return event.type === "spiel" && event.isHomeGame === false;
  };

  // Kompakte Monatsraster: 12 Kacheln wie ein Wandkalender.
  // Tag oder Kalenderwoche öffnen die Wochenansicht; Monatstitel öffnet den Monat.
  const renderYearView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
      {visibleCalendarMonths(currentYear, todayDate, showPastMonths).map(month => (
        <Card key={month} className={`p-3 ${currentYear === todayDate.getFullYear() && month === todayDate.getMonth() ? "border-primary" : ""}`}>
          <p className="mb-2 text-xs text-muted-foreground text-right">{filteredEvents.filter(event => Number(event.date.slice(5, 7)) === month + 1).length} Termine</p>
          <MonthGrid
            year={currentYear}
            month={month}
            title={`${MONTHS_DE[month]} ${currentYear}`}
            eventsByDate={eventsByDate}
            conflictDates={conflictDates}
            todayStr={today}
            onDayClick={openWeek}
            onWeekClick={openWeek}
            onTitleClick={() => {
              setSelectedMonth(month);
              setViewMode("month");
            }}
          />
        </Card>
      ))}
      {visibleCalendarMonths(currentYear, todayDate, showPastMonths).length === 0 && <div className="col-span-full rounded-lg border p-6 text-center text-muted-foreground">Alle Monate des Jahres {currentYear} sind vergangen. <Button variant="ghost" onClick={() => setShowPastMonths(true)}>Vergangene Monate anzeigen</Button></div>}
    </div>
  );

  const renderMonthView = () => {
    const days = getDaysInMonth(currentYear, selectedMonth);
    const monthEvents = filteredEvents.filter(event => Number(event.date.slice(5, 7)) === selectedMonth + 1);
    const games = monthEvents.filter(event => event.type === "spiel").sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    let lastWeek = -1;

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={goBack} aria-label="Zurück zur Jahresübersicht" data-testid="button-back" className="shrink-0 px-2 sm:px-3">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Zurück zur Jahresübersicht</span>
            </Button>
            <CardTitle className="order-first w-full break-words text-center text-base sm:order-none sm:w-auto sm:text-xl">{MONTHS_DE[selectedMonth]} {currentYear}</CardTitle>
            <div className="flex gap-1 shrink-0">
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
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Monatsdarstellung">
            <Button variant={monthLayout === "games" ? "default" : "outline"} size="sm" onClick={() => setMonthLayout("games")}>Spiele als Kacheln ({games.length})</Button>
            <Button variant={monthLayout === "agenda" ? "default" : "outline"} size="sm" onClick={() => setMonthLayout("agenda")}>Alle Termine ({monthEvents.length})</Button>
          </div>
          {monthLayout === "games" ? (
            games.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{games.map(event => <button type="button" key={event.id} className={`rounded-lg border p-4 text-left transition-shadow hover:shadow-md ${getEventColorClass(event)}`} onClick={e => handleEventClick(event, e)} data-testid={`month-game-${event.id}`}>
              <p className="text-sm font-medium">{new Date(`${event.date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
              <p className="mt-1 text-lg font-bold">{event.startTime}–{event.endTime} Uhr</p>
              <p className="mt-2 font-semibold wrap-break-word">{event.title}</p>
              {event.team && <p className="text-sm">{TEAM_LABELS[event.team]}</p>}
              {event.opponent && <p className="text-sm">Gegner: {event.opponent}</p>}
              <p className="mt-2 text-sm font-medium">{event.isHomeGame === false ? "Auswärtsspiel" : event.isHomeGame === true ? "Heimspiel" : "Spielort offen"} · {event.isHomeGame === false ? event.location || "Ort noch offen" : event.field ? FIELD_LABELS[event.field] : event.location || "Platz noch offen"}</p>
            </button>)}</div> : <p className="rounded-lg bg-muted/50 p-6 text-center text-muted-foreground">Keine Spiele für {MONTHS_DE[selectedMonth]} {currentYear} in dieser Auswahl. Trainings und andere Einträge findest du unter „Alle Termine“.</p>
          ) : <div className="space-y-1">
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
              const hasConflict = conflictDates.has(dateStr);

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
                  <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:flex-wrap gap-1">
                    {dayEvents.map((event) => (
                      <Badge
                        key={event.id}
                        className={`${getEventColorClass(event)} cursor-pointer max-w-full truncate block ${isAwayGame(event) ? "italic border border-current" : ""}`}
                        onClick={(e) => handleEventClick(event, e)}
                        data-testid={`event-badge-${event.id}`}
                      >
                        <span className="truncate">
                          {event.team && <span className="font-bold mr-1">[{getTeamShortLabel(event.team)}]{isAwayGame(event) ? "(A)" : ""}</span>}
                          {event.startTime} {event.title}
                        </span>
                      </Badge>
                    ))}
                    {dayEvents.length === 0 && (
                      <span className="text-muted-foreground text-sm">Klicken um Termin zu erstellen</span>
                    )}
                  </div>
                  {showWeekNum && (
                    <span className="w-10 sm:w-12 shrink-0 text-right text-muted-foreground text-xs sm:text-sm">KW {weekNum}</span>
                  )}
                </div>
              );
            })}
          </div>}
        </CardContent>
      </Card>
    );
  };

  const renderWeekView = () => <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" size="sm" onClick={() => setViewMode("year")}><ArrowLeft className="h-4 w-4" />Zum Jahr</Button><div className="order-first w-full text-center sm:order-none sm:w-auto"><CardTitle className="text-xl">KW {week.number} · {week.year}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{week.start.split("-").reverse().join(".")} bis {week.end.split("-").reverse().join(".")}</p></div><div className="flex gap-1"><Button variant="outline" size="icon" aria-label="Vorherige Woche" onClick={() => openWeek(shiftCalendarDate(week.start, -7))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Nächste Woche" onClick={() => openWeek(shiftCalendarDate(week.start, 7))}><ChevronRight className="h-4 w-4" /></Button></div></div></CardHeader><CardContent><div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-7">{week.days.map(day => <section key={day} className={`min-w-0 space-y-3 rounded-lg border p-3 ${day === today ? "border-primary bg-primary/5" : ""}`} aria-label={`Tag ${day}`}><h2 className="text-sm font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</h2>{(eventsByDate.get(day) ?? []).map(event => <div key={event.id} className={`space-y-2 rounded-lg p-2 ${getEventColorClass(event)}`} data-testid={`week-event-${event.id}`}><p className="text-xs font-medium">{event.startTime}–{event.endTime}</p><button type="button" className="block w-full wrap-anywhere text-left text-sm font-semibold underline-offset-2 hover:underline" onClick={() => editEvent(event)}>{event.title}</button>{event.team && <p className="text-xs">{TEAM_LABELS[event.team]}</p>}<p className="wrap-anywhere text-xs">{event.isHomeGame === false ? event.location || "Auswärtsspiel" : event.field ? FIELD_LABELS[event.field] : event.location || "Ort offen"}</p>{canWrite && <Button size="sm" variant="outline" className="w-full bg-background text-foreground" aria-label={`${event.title} löschen`} onClick={() => setDeleteTarget({ event, scope: "single" })}><Trash2 className="h-4 w-4" />Löschen</Button>}</div>)}{!eventsByDate.has(day) && <p className="text-xs text-muted-foreground">Keine Termine</p>}{canWrite && <Button size="sm" variant="ghost" className="w-full" onClick={() => openCreateDialog(day)} aria-label={`Termin am ${day} erstellen`}><Plus className="h-4 w-4" />Termin</Button>}</section>)}</div></CardContent></Card>;

  const renderDayView = () => {
    if (!selectedDate) return null;
    const dayEvents = eventsByDate.get(selectedDate) || [];
    const date = new Date(selectedDate);

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={goBack} aria-label="Zurück zum Monat" data-testid="button-back-day" className="shrink-0 px-2 sm:px-3">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Zurück zum Monat</span>
            </Button>
            <CardTitle className="order-first w-full text-sm sm:order-none sm:w-auto sm:text-xl text-center">
              <span className="sm:hidden">
                {date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="hidden sm:inline">
                {date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
            </CardTitle>
            {canWrite && <Button onClick={() => openCreateDialog(selectedDate)} aria-label="Termin an diesem Tag erstellen" data-testid="button-add-event-day" size="sm" className="shrink-0">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Neuer Termin</span>
            </Button>}
          </div>
        </CardHeader>
        <CardContent>
          {dayEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Keine Termine an diesem Tag</p>
              {canWrite && <Button className="mt-4" onClick={() => openCreateDialog(selectedDate)}>
                <Plus className="h-4 w-4 mr-2" />
                Termin erstellen
              </Button>}
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 [&>div]:min-w-0">
          <div>
            <h1 className="text-2xl font-bold">
              {viewMode === "year" ? `Jahreskalender ${currentYear}` :
               viewMode === "month" ? `${MONTHS_DE[selectedMonth]} ${currentYear}` :
               viewMode === "week" ? `Wochenansicht · KW ${week.number} ${week.year}` :
               `Tagesansicht ${currentYear}`}
            </h1>
            <p className="text-muted-foreground text-sm">
              {filteredEvents.length} von {events.length} Terminen · {visibleConflicts.length} Konflikte in der Auswahl
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {canWrite && <DialogTrigger asChild>
              <Button onClick={() => openCreateDialog()} data-testid="button-add-event" aria-label="Neuen Termin erstellen">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Neuer Termin</span>
              </Button>
            </DialogTrigger>}
            <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[95vh] overflow-y-auto overflow-x-hidden pb-8">
              <DialogHeader>
                <DialogTitle>
                  {editingEvent ? (canWrite ? "Termin bearbeiten" : "Termin ansehen") : "Neuer Termin"}
                </DialogTitle>
                <DialogDescription>
                  {editingEvent ? (canWrite ? "Bearbeiten Sie die Termindetails" : "Termindetails ansehen") : "Erstellen Sie einen neuen Termin im Kalender"}
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
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-full min-w-0 sm:w-40 sm:flex-1" data-testid="filter-team">
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
            <SelectTrigger className="w-full min-w-0 sm:w-40 sm:flex-1" data-testid="filter-type">
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

          <Select value={filterField} onValueChange={setFilterField}>
            <SelectTrigger className="w-full min-w-0 sm:flex-1" aria-label="Nach Platz filtern"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle Plätze</SelectItem>{FIELDS.map(field => <SelectItem key={field} value={field}>{FIELD_LABELS[field]}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="w-full min-w-0 sm:flex-1" value={search} onChange={event => setSearch(event.target.value)} placeholder="Termin, Gegner oder Ort suchen" aria-label="Kalender durchsuchen" />
          {(filterTeam !== "all" || filterType !== "all" || filterField !== "all" || search) && <Button variant="ghost" size="sm" onClick={() => { setFilterTeam("all"); setFilterType("all"); setFilterField("all"); setSearch(""); }}>Filter zurücksetzen</Button>}
          <Button variant="outline" onClick={handleExport} aria-label="Kalender als CSV exportieren" data-testid="button-export" size="sm">
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">CSV Export</span>
          </Button>

          <BfvImportButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Kalenderansicht">
        <Button variant={viewMode === "year" ? "default" : "outline"} size="sm" onClick={() => setViewMode("year")}>Jahr</Button>
        <Button variant={viewMode === "month" ? "default" : "outline"} size="sm" onClick={() => setViewMode("month")}>Monat</Button>
        <Button variant={viewMode === "week" ? "default" : "outline"} size="sm" onClick={() => viewMode !== "week" && openWeek((selectedDate?.startsWith(`${currentYear}-${String(selectedMonth + 1).padStart(2, "0")}-`) ? selectedDate : undefined) ?? (currentYear === todayDate.getFullYear() && selectedMonth === todayDate.getMonth() ? today : `${currentYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`))}>Woche</Button>
        <span className="rounded-md bg-muted px-3 py-1 text-sm font-semibold">Kalenderjahr {currentYear}</span>
        <Button variant="outline" size="sm" onClick={() => { if (viewMode === "year" || viewMode === "week") { openWeek(today); return; } setCurrentYear(todayDate.getFullYear()); setSelectedMonth(todayDate.getMonth()); setSelectedDate(today); setViewMode("day"); }}>Heute</Button>
        <span className="text-xs text-muted-foreground">Tag oder KW öffnet die Woche · Dort Termine bearbeiten und löschen · Roter Rahmen zeigt Konflikte</span>
      </div>
      {eventsError && <div role="alert" className="rounded-lg border border-destructive p-4">Die Kalendertermine konnten nicht geladen werden. <Button variant="outline" size="sm" onClick={() => void refetchEvents()}>Erneut versuchen</Button></div>}
      {conflictsError && <p role="alert" className="rounded-lg border border-destructive p-4 text-sm">Die Konfliktprüfung ist momentan nicht verfügbar. Die angezeigten Termine wurden nicht auf Überschneidungen geprüft.</p>}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Kalender wird geladen …</p>}
      {!isLoading && !eventsError && events.length > 0 && filteredEvents.length === 0 && <p role="status" className="rounded-lg border p-4 text-muted-foreground">Keine Termine passen zu den ausgewählten Filtern.</p>}
      {viewMode === "year" && (
        <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentYear(currentYear - 1)}
            data-testid="button-prev-year"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xl font-semibold min-w-20 text-center">{currentYear}</span>
          <Button variant="outline" size="sm" onClick={() => setShowPastMonths(value => !value)} aria-pressed={showPastMonths}>{showPastMonths ? "Vergangene Monate ausblenden" : "Vergangene Monate anzeigen"}</Button>
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

      {visibleConflicts.length > 0 && viewMode === "year" && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {visibleConflicts.length} Konflikt{visibleConflicts.length !== 1 ? "e" : ""} gefunden
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {visibleConflicts.slice(0, 5).map((conflict, i) => (
                <button key={i} type="button" className="block text-left text-sm underline underline-offset-4" onClick={() => openWeek(conflict.event1.date)}>
                  <span className="font-medium">{new Date(`${conflict.event1.date}T12:00:00`).toLocaleDateString("de-DE")} · </span>
                  <span className="font-medium">{conflict.event1.title}</span>
                  {" & "}
                  <span className="font-medium">{conflict.event2.title}</span>
                  {" - "}
                  <span className="text-muted-foreground">{conflict.reason}</span>
                </button>
              ))}
              {visibleConflicts.length > 5 && (
                <p className="text-sm text-muted-foreground">
                  ... und {visibleConflicts.length - 5} weitere
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === "year" && renderYearView()}
      {viewMode === "month" && renderMonthView()}
      {viewMode === "day" && renderDayView()}
      {viewMode === "week" && renderWeekView()}
      {deleteTarget && <DeleteCalendarEventDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      
      {/* Mannschaftsfarben (Legende): Kräftig = Spiel, Hell mit Rand = Training */}
      <details className="mt-6 pt-4 border-t">
        <summary className="cursor-pointer text-sm font-medium mb-2 text-muted-foreground">Mannschaftsfarben und Legende</summary>
        <p className="text-xs text-muted-foreground mb-2">Kräftig = Spiel · Hell mit Rand = Training</p>
        <div className="flex flex-wrap gap-2">
          {TEAMS.filter(team => filteredEvents.some(event => event.team === team)).map((team) => (
            <span key={team} className="inline-flex items-center gap-1">
              <Badge className={TEAM_COLORS_SPIEL[team]} data-testid={`legend-spiel-${team}`}>Spiel</Badge>
              <Badge className={TEAM_COLORS_TRAINING[team]} data-testid={`legend-training-${team}`}>Training</Badge>
              <span className="text-xs text-muted-foreground mr-2">{TEAM_LABELS[team]}</span>
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}

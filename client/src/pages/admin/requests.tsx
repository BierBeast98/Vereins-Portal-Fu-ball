import type { FeedbackResult } from "@shared/request-feedback";
import { RequestFeedback } from "@/components/request-feedback";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventRequest, Field, Team } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FIELD_LABELS, FIELDS, TEAMS, TEAM_LABELS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const TZ_BERLIN = "Europe/Berlin";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { timeZone: TZ_BERLIN, dateStyle: "short", timeStyle: "short" });
}

/** ISO string → "YYYY-MM-DDTHH:mm" in Europe/Berlin for datetime-local inputs */
function isoToDatetimeLocalBerlin(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour.padStart(2, "0")}:${parts.minute.padStart(2, "0")}`;
}

/** Start/Ende eines Serien-Termins: Datum vom jeweiligen Termin, Uhrzeit/Dauer aus den Dialog-Feldern */
function computeOccurrenceTimes(req: EventRequest, baseStart: Date, durationMs: number): { start: Date; end: Date } {
  const dateOnly = req.startAt.slice(0, 10); // YYYY-MM-DD
  const start = new Date(dateOnly + "T00:00:00");
  start.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
  const end = new Date(start.getTime() + durationMs);
  return { start, end };
}

interface OccurrenceConflict {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface RequestGroup {
  head: EventRequest;
  items: EventRequest[];
  count: number;
}

interface ApprovePayload {
  title: string;
  pitch: Field;
  start: string;
  end: string;
  team?: Team;
  adminNote?: string;
  rejectionReason?: string;
  force?: boolean;
  /** Termine, die der Admin aus der Serie ausgeschlossen hat → werden abgelehnt */
  excludedIds: string[];
  /** Termine, die trotz bekanntem Konflikt behalten wurden → einzeln mit force freigeben */
  conflictIds: string[];
}

interface ApproveInput {
  group: RequestGroup;
  payload: ApprovePayload;
}

export default function RequestsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [feedbackEmailFailed, setFeedbackEmailFailed] = useState(false);
  const [feedbackRequests, setFeedbackRequests] = useState<EventRequest[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<RequestGroup | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{
    pendingApprove: ApproveInput;
    conflicts: { title: string; date: string; startTime: string; endTime: string }[];
  } | null>(null);

  const { data: requests = [], isLoading } = useQuery<EventRequest[]>({
    queryKey: ["/api/admin/event-requests", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`/api/admin/event-requests?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load requests");
      return res.json();
    },
  });

  const groupedRequests = useMemo(() => {
    const map = new Map<string, EventRequest[]>();
    for (const req of requests) {
      const start = new Date(req.startAt);
      const end = new Date(req.endAt);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
      const key = [
        req.createdBy ?? "",
        req.contactEmail ?? "",
        req.contactPhone ?? "",
        req.rejectionReason ?? "",
        req.type,
        req.team ?? "",
        req.title,
        req.pitch,
        // Berlin-Ortszeit verwenden (nicht UTC), damit Zeitumstellung keine Gruppe splittet
        new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin", hour12: false }).format(start),
        durationMinutes.toString(),
        req.note ?? "",
        req.status,
      ].join("|");
      const list = map.get(key) ?? [];
      list.push(req);
      map.set(key, list);
    }
    const groups = Array.from(map.values()).map((list) => {
      const sorted = [...list].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );
      return {
        head: sorted[0],
        items: sorted,
        count: sorted.length,
      };
    });
    groups.sort(
      (a, b) => new Date(a.head.startAt).getTime() - new Date(b.head.startAt).getTime()
    );
    return groups;
  }, [requests]);

  const approveMutation = useMutation({
    mutationFn: async (input: ApproveInput) => {
      const { group, payload } = input;
      if (!group) throw new Error("No selection");
      const decided: FeedbackResult[] = [];

      const baseStart = new Date(payload.start);
      const baseEnd = new Date(payload.end);
      if (isNaN(baseStart.getTime()) || isNaN(baseEnd.getTime())) {
        throw new Error("Ungültige Start- oder Endzeit");
      }
      const durationMs = baseEnd.getTime() - baseStart.getTime();
      if (payload.excludedIds.length && !payload.rejectionReason?.trim()) throw new Error("Bitte einen Grund für die ausgeschlossenen Termine angeben.");

      const included = group.items.filter((r) => !payload.excludedIds.includes(r.id));
      if (included.length === 0) {
        throw new Error("Alle Termine sind ausgeschlossen – zum Ablehnen der ganzen Serie bitte 'Ablehnen' nutzen.");
      }

      // Gemeinsame Serien-ID für alle Kalender-Events der Serie
      const recurringGroupId =
        (crypto as any)?.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36);

      for (const req of included) {
        const { start, end } = computeOccurrenceTimes(req, baseStart, durationMs);

        const body: any = {
          title: payload.title,
          pitch: payload.pitch,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          recurringGroupId,
        };
        if (payload.team !== undefined) body.team = payload.team;
        if (payload.adminNote) body.adminNote = payload.adminNote;
        // Bewusst behaltene Konflikt-Termine einzeln erzwingen
        if (payload.force || payload.conflictIds.includes(req.id)) body.force = true;

        const res = await fetch(`/api/admin/event-requests/${req.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && data.code === "CONFLICT") {
            const err: any = new Error("CONFLICT");
            err.isConflict = true;
            err.conflicts = data.conflicts ?? [];
            err.originalInput = input;
            throw err;
          }
          throw new Error(data?.message || data?.error || "Freigabe fehlgeschlagen");
        }
        const result = await res.json();
        decided.push({ request: result.request ?? result, delivery: result.emailDelivery });
      }

      // Ausgeschlossene Termine erst NACH erfolgreicher Freigabe ablehnen
      for (const req of group.items) {
        if (!payload.excludedIds.includes(req.id)) continue;
        const res = await fetch(`/api/admin/event-requests/${req.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            status: "rejected",
            rejectionReason: payload.rejectionReason,
            adminNote: payload.adminNote,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Ausschluss eines Einzeltermins fehlgeschlagen");
        }
        const result = await res.json();
        decided.push({ request: result, delivery: result.emailDelivery });
      }
      return decided;
    },
    onSuccess: (decided) => {
      const failed = decided.some(item => item.delivery === "failed");
      const sent = decided.filter(item => item.delivery === "sent").length;
      setFeedbackEmailFailed(failed);
      setFeedbackRequests(decided.filter(item => item.delivery === "manual" || item.delivery === "failed").map(item => item.request));
      const type = selectedGroup?.head?.type;
      const title =
        type === "delete_request"
          ? "Termin gelöscht"
          : type === "change_request"
          ? "Termin geändert"
          : "Vorschlag freigegeben";
      const description =
        type === "delete_request"
          ? "Der Termin wurde aus dem Kalender entfernt."
          : type === "change_request"
          ? "Der Termin wurde im Kalender aktualisiert."
          : type === "spiel" ? "Das Spiel wurde in den Kalender übernommen." : "Das Training wurde in den Kalender übernommen.";
      toast({ title, description: failed ? "Die Entscheidung ist gespeichert, aber mindestens eine E-Mail konnte nicht versendet werden. Bitte nutze die vorbereitete manuelle Rückmeldung." : sent ? `${description} ${sent} E-Mail${sent === 1 ? " wurde" : "s wurden"} automatisch versendet.` : description, variant: failed ? "destructive" : "default" });
      setSelectedGroup(null);
      setConflictInfo(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
    onError: (err: any) => {
      if (err.isConflict) {
        setConflictInfo({ pendingApprove: err.originalInput, conflicts: err.conflicts });
        return;
      }
      toast({ title: "Fehler", description: err.message ?? "Freigabe fehlgeschlagen.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (input: { group: RequestGroup; rejectionReason: string }) => {
      const { group, rejectionReason } = input;
      if (!group) throw new Error("No selection");
      const decided: FeedbackResult[] = [];

      for (const req of group.items) {
        const res = await fetch(`/api/admin/event-requests/${req.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "rejected", rejectionReason }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Ablehnung fehlgeschlagen");
        }
        const result = await res.json();
        decided.push({ request: result.request ?? result, delivery: result.emailDelivery });
      }
      return decided;
    },
    onSuccess: (decided) => {
      const failed = decided.some(item => item.delivery === "failed");
      const sent = decided.filter(item => item.delivery === "sent").length;
      setFeedbackEmailFailed(failed);
      setFeedbackRequests(decided.filter(item => item.delivery === "manual" || item.delivery === "failed").map(item => item.request));
      toast({ title: "Vorschlag abgelehnt", description: failed ? "Die Ablehnung ist gespeichert, aber mindestens eine E-Mail konnte nicht versendet werden. Bitte nutze die vorbereitete manuelle Rückmeldung." : sent ? `Die Begründung ist gespeichert. ${sent} E-Mail${sent === 1 ? " wurde" : "s wurden"} automatisch versendet.` : "Die Begründung ist gespeichert. Bei hinterlegter Telefonnummer kannst du die Rückmeldung über WhatsApp selbst versenden.", variant: failed ? "destructive" : "default" });
      setSelectedGroup(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message ?? "Ablehnung fehlgeschlagen.", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: {
      group: RequestGroup;
      payload: { title: string; pitch: Field; start: string; end: string; team?: Team | "_none" };
    }) => {
      const { group, payload } = input;
      if (!group) throw new Error("No selection");
      const baseStart = new Date(payload.start);
      const baseEnd = new Date(payload.end);
      if (isNaN(baseStart.getTime()) || isNaN(baseEnd.getTime())) {
        throw new Error("Ungültige Start- oder Endzeit");
      }
      const durationMs = baseEnd.getTime() - baseStart.getTime();
      for (const req of group.items) {
        const { start: startAt, end: endAt } = computeOccurrenceTimes(req, baseStart, durationMs);
        const body: Record<string, unknown> = {
          title: payload.title,
          pitch: payload.pitch,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        };
        if (payload.team !== undefined) body.team = payload.team === "_none" ? null : payload.team;
        const res = await fetch(`/api/admin/event-requests/${req.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Speichern fehlgeschlagen");
        }
      }
      return true;
    },
    onSuccess: () => {
      toast({ title: "Gespeichert", description: "Anfrage(n) wurden aktualisiert." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message ?? "Speichern fehlgeschlagen.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vorschläge / Requests</h1>
          <p className="text-muted-foreground text-sm">
            Trainingsvorschläge von Betreuern prüfen, bearbeiten und in den Kalender übernehmen.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Offen</SelectItem>
            <SelectItem value="approved">Freigegeben</SelectItem>
            <SelectItem value="rejected">Abgelehnt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading
              ? "Lade Vorschläge..."
              : `${groupedRequests.length} Anfrage${groupedRequests.length === 1 ? "" : "n"} (Serien gruppiert, insgesamt ${requests.length} Vorschläge)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Keine Vorschläge für den ausgewählten Status.</p>
          )}
          {groupedRequests.map((group) => {
            const { head, items, count } = group;
            return (
            <button
              key={head.id}
              className="w-full text-left border rounded-md px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-3"
              onClick={() => setSelectedGroup(group)}
            >
              <div>
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {head.title}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({FIELD_LABELS[head.pitch]})
                  </span>
                  {head.type === "delete_request" && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Löschen
                    </Badge>
                  )}
                  {head.type === "change_request" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Änderung
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(head.startAt)} – {formatDateTime(head.endAt)}{" "}
                  {head.createdBy && `· ${head.createdBy}`}
                  {head.contactEmail && ` · ${head.contactEmail}`}
                  {head.contactPhone && ` · ${head.contactPhone}`}
                  {head.type === "spiel" && " · Spielantrag"}
                  {head.team && ` · ${TEAM_LABELS[head.team as Team]}`}
                  {count > 1 && (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      · Serie, {count} Termine (bis{" "}
                      {formatDateTime(items[items.length - 1].startAt)})
                    </span>
                  )}
                </div>
              </div>
              <Badge
                variant={
                  head.status === "pending"
                    ? "outline"
                    : head.status === "approved"
                    ? "default"
                    : "destructive"
                }
              >
                {head.status === "pending"
                  ? "Offen"
                  : head.status === "approved"
                  ? "Freigegeben"
                  : "Abgelehnt"}
              </Badge>
            </button>
          )})}
        </CardContent>
      </Card>

      {feedbackRequests.length > 0 && <Dialog open onOpenChange={open => { if (!open) setFeedbackRequests([]); }}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{feedbackEmailFailed ? "E-Mail-Versand fehlgeschlagen" : "Rückmeldung per WhatsApp"}</DialogTitle><DialogDescription>{feedbackEmailFailed ? "Die Entscheidung wurde gespeichert. Du kannst die Nachricht ersatzweise über deinen eigenen Account versenden." : "Für Telefonnummern ist die Nachricht vorbereitet. Öffne WhatsApp und sende sie selbst ab."}</DialogDescription></DialogHeader>
          <RequestFeedback requests={feedbackRequests} emailFailed={feedbackEmailFailed} />
          <DialogFooter><Button variant="outline" onClick={() => setFeedbackRequests([])}>Schließen</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
      {selectedGroup && (
        <RequestDialog
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onSave={(payload) => saveMutation.mutate({ group: selectedGroup, payload })}
          onApprove={(payload) => approveMutation.mutate({ group: selectedGroup, payload })}
          onReject={(reason) => rejectMutation.mutate({ group: selectedGroup, rejectionReason: reason })}
          isSaving={saveMutation.isPending || approveMutation.isPending || rejectMutation.isPending}
        />
      )}

      {conflictInfo && (
        <Dialog open onOpenChange={(open) => { if (!open) setConflictInfo(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Terminkonflikt</DialogTitle>
              <DialogDescription>
                Der Termin überschneidet sich mit bestehenden Einträgen. Trotzdem eintragen?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {conflictInfo.conflicts.map((c, i) => (
                <div key={i} className="border rounded px-3 py-2 bg-muted/40">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-muted-foreground ml-2">
                    {c.date} · {c.startTime}–{c.endTime}
                  </span>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConflictInfo(null)}>
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const input = conflictInfo.pendingApprove;
                  setConflictInfo(null);
                  approveMutation.mutate({
                    ...input,
                    payload: { ...input.payload, force: true },
                  });
                }}
              >
                Trotzdem eintragen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface RequestDialogProps {
  group: RequestGroup;
  onClose: () => void;
  onSave: (payload: { title: string; pitch: Field; start: string; end: string; team?: Team | "_none" }) => void;
  onApprove: (payload: ApprovePayload) => void;
  onReject: (reason: string) => void;
  isSaving?: boolean;
}

function formatOccurrence(start: Date, end?: Date): string {
  const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${dateFmt.format(start)} · ${timeFmt.format(start)}${end ? `–${timeFmt.format(end)}` : ""}`;
}

function RequestDialog({ group, onClose, onSave, onApprove, onReject, isSaving = false }: RequestDialogProps) {
  const { head, count, items } = group;
  const [title, setTitle] = useState(head.title);
  const [pitch, setPitch] = useState<Field>(head.pitch);
  const [start, setStart] = useState(() => isoToDatetimeLocalBerlin(head.startAt));
  const [end, setEnd] = useState(() => isoToDatetimeLocalBerlin(head.endAt));
  const [team, setTeam] = useState<Team | "_none">((head.team as Team) || "_none");
  const [adminNote, setAdminNote] = useState(head.adminNote ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState(head.rejectionReason ?? "");
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const isPendingStatus = head.status === "pending";
  const showOccurrences = head.type !== "delete_request";

  // Termine mit den aktuell im Dialog eingestellten Zeiten (Datum je Termin, Uhrzeit/Dauer aus den Feldern)
  const occurrences = useMemo(() => {
    const baseStart = new Date(start);
    const baseEnd = new Date(end);
    if (isNaN(baseStart.getTime()) || isNaN(baseEnd.getTime()) || baseEnd.getTime() <= baseStart.getTime()) {
      return null;
    }
    const durationMs = baseEnd.getTime() - baseStart.getTime();
    return items.map((req) => {
      const t = computeOccurrenceTimes(req, baseStart, durationMs);
      return { id: req.id, start: t.start, end: t.end };
    });
  }, [items, start, end]);

  // Konflikt-Vorprüfung beim Öffnen und bei jeder Änderung von Platz/Zeit
  const { data: conflictMap, isFetching: checkingConflicts } = useQuery({
    queryKey: [
      "/api/admin/event-requests",
      "check-conflicts",
      items.map((i) => i.id).join(","),
      pitch,
      start,
      end,
    ],
    enabled: isPendingStatus && showOccurrences && !!occurrences,
    queryFn: async () => {
      const res = await fetch("/api/admin/event-requests/check-conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: (occurrences ?? []).map((o) => ({
            id: o.id,
            pitch,
            startAt: o.start.toISOString(),
            endAt: o.end.toISOString(),
          })),
        }),
      });
      if (!res.ok) throw new Error("Konfliktprüfung fehlgeschlagen");
      const data = (await res.json()) as { results: { id: string; conflicts: OccurrenceConflict[] }[] };
      return new Map(data.results.map((r) => [r.id, r.conflicts]));
    },
  });

  const includedCount = count - excludedIds.size;
  const conflictIds = items
    .filter((r) => !excludedIds.has(r.id) && (conflictMap?.get(r.id)?.length ?? 0) > 0)
    .map((r) => r.id);

  const toggleExcluded = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePayload = () => ({
    title,
    pitch,
    start,
    end,
    team: team === "_none" ? undefined : team,
  });

  const handleSave = () => {
    onSave({ ...savePayload(), team: team });
  };

  const handleApprove = () => {
    onApprove({
      ...savePayload(),
      adminNote: adminNote || undefined,
      rejectionReason: rejectionReason.trim() || undefined,
      excludedIds: Array.from(excludedIds),
      conflictIds,
    });
  };

  const handleReject = () => {
    if (!rejecting) { setRejecting(true); return; }
    if (rejectionReason.trim()) onReject(rejectionReason.trim());
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vorschlag prüfen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              Angelegt von {head.createdBy || "unbekannt"} am{" "}
              {formatDateTime(head.createdAt)}
            </div>
            {(head.contactEmail || head.contactPhone) && <div className="flex flex-wrap gap-3">
              {head.contactEmail && <a className="text-primary underline" href={`mailto:${head.contactEmail}`}>{head.contactEmail}</a>}
              {head.contactPhone && <a className="text-primary underline" href={`tel:${head.contactPhone.replace(/[^+0-9]/g, "")}`}>{head.contactPhone}</a>}
            </div>}
            {!head.contactEmail && !head.contactPhone && <p>Keine Rückmeldung angefordert.</p>}
            {head.rejectionReason && <p className="whitespace-pre-wrap rounded-md border p-3"><strong>Grund der Ablehnung:</strong> {head.rejectionReason}</p>}
            {head.type === "delete_request" && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 text-destructive px-3 py-2 text-sm font-medium">
                Löschvorschlag – dieser Termin wird nach Bestätigung dauerhaft aus dem Kalender entfernt.
              </div>
            )}
            {head.type === "change_request" && (
              <div className="rounded-md bg-secondary/50 border px-3 py-2 text-sm text-muted-foreground">
                Änderungsvorschlag – der bestehende Termin wird mit den unten angegebenen Daten aktualisiert.
              </div>
            )}
          </div>
          {showOccurrences && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {count > 1 ? `Serie mit ${count} Terminen` : "Termin"}
                  {excludedIds.size > 0 && (
                    <span className="text-muted-foreground font-normal"> · {excludedIds.size} ausgeschlossen</span>
                  )}
                </span>
                {checkingConflicts ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Prüfe Konflikte…
                  </span>
                ) : conflictIds.length > 0 ? (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {conflictIds.length} Termin{conflictIds.length === 1 ? "" : "e"} mit Konflikt
                  </span>
                ) : isPendingStatus && conflictMap ? (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Keine Konflikte
                  </span>
                ) : null}
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {items.map((req, idx) => {
                  const conflicts = conflictMap?.get(req.id) ?? [];
                  const excluded = excludedIds.has(req.id);
                  const occ = occurrences?.[idx];
                  return (
                    <div
                      key={req.id}
                      className={`flex items-start gap-2 px-3 py-2 text-sm${excluded ? " opacity-50" : ""}`}
                    >
                      {isPendingStatus && count > 1 && (
                        <Checkbox
                          checked={!excluded}
                          onCheckedChange={() => toggleExcluded(req.id)}
                          className="mt-0.5"
                          aria-label="Termin in Freigabe einschließen"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className={excluded ? "line-through" : ""}>
                          {occ ? formatOccurrence(occ.start, occ.end) : formatDateTime(req.startAt)}
                        </span>
                        {conflicts.length > 0 && !excluded && (
                          <div className="text-xs text-destructive mt-0.5 space-y-0.5">
                            {conflicts.map((c) => (
                              <div key={c.id} className="truncate">
                                Konflikt: {c.title} · {c.startTime}–{c.endTime}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 mt-0.5">
                        {excluded ? null : checkingConflicts ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : conflicts.length > 0 ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : isPendingStatus && conflictMap ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {count > 1 && isPendingStatus && (
                <p className="text-xs text-muted-foreground">
                  Abgewählte Termine werden bei der Freigabe automatisch abgelehnt. Termine mit Konflikt werden
                  eingetragen, wenn sie ausgewählt bleiben.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Platz</Label>
              <Select value={pitch} onValueChange={(v: any) => setPitch(v as Field)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FIELD_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start">Start</Label>
              <Input
                id="start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">Ende</Label>
              <Input
                id="end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mannschaft</Label>
            <Select value={team} onValueChange={(v) => setTeam(v as Team | "_none")}>
              <SelectTrigger>
                <SelectValue placeholder="Keine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Keine</SelectItem>
                {TEAMS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TEAM_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isPendingStatus && <div className="rounded-lg border p-3"><RequestFeedback requests={items} /></div>}
          <div className="space-y-2">
            <Label>Notiz Betreuer</Label>
            <Textarea value={head.note ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminNote">Admin-Notiz (optional)</Label>
            <Textarea
              id="adminNote"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
          </div>
          {(rejecting || excludedIds.size > 0) && <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
            <Label htmlFor="rejection-reason">{rejecting ? "Grund der Ablehnung" : "Grund für ausgeschlossene Termine"} *</Label>
            <Textarea id="rejection-reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} required maxLength={5000} autoFocus />
            <p className="text-xs text-muted-foreground">Mit hinterlegter E-Mail-Adresse wird die Begründung automatisch versendet. Ist nur eine Telefonnummer hinterlegt, öffnest und versendest du die vorbereitete WhatsApp-Nachricht selbst.</p>
          </div>}
        </div>
        <DialogFooter className="mt-4 flex-wrap gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Schließen
          </Button>
          {rejecting && <Button variant="outline" onClick={() => setRejecting(false)} disabled={isSaving}>Zurück zur Prüfung</Button>}
          <Button variant="secondary" onClick={handleSave} disabled={isSaving || rejecting}>
            {isSaving ? "Speichern…" : "Speichern"}
          </Button>
          <Button variant="destructive" onClick={handleReject} disabled={isSaving || (rejecting && !rejectionReason.trim())}>
            {rejecting ? "Ablehnung bestätigen" : `Ablehnen${count > 1 ? " (Serie)" : ""}`}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isSaving || rejecting || (excludedIds.size > 0 && !rejectionReason.trim()) || (showOccurrences && includedCount === 0)}
            variant={head.type === "delete_request" ? "destructive" : "default"}
          >
            {head.type === "delete_request"
              ? "Löschen bestätigen"
              : excludedIds.size > 0
              ? `Freigeben & eintragen (${includedCount} von ${count})`
              : `Freigeben & eintragen${count > 1 ? " (Serie)" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


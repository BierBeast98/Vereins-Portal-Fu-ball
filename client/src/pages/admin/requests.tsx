import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventRequest, Field, Team } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIELD_LABELS, FIELDS, TEAMS, TEAM_LABELS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

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

interface RequestGroup {
  head: EventRequest;
  items: EventRequest[];
  count: number;
}

export default function RequestsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [selectedGroup, setSelectedGroup] = useState<RequestGroup | null>(null);

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
    mutationFn: async (input: {
      group: RequestGroup;
      payload: { title: string; pitch: Field; start: string; end: string; team?: Team; adminNote?: string };
    }) => {
      const { group, payload } = input;
      if (!group) throw new Error("No selection");

      const baseStart = new Date(payload.start);
      const baseEnd = new Date(payload.end);
      if (isNaN(baseStart.getTime()) || isNaN(baseEnd.getTime())) {
        throw new Error("Ungültige Start- oder Endzeit");
      }
      const durationMs = baseEnd.getTime() - baseStart.getTime();

      // Gemeinsame Serien-ID für alle Kalender-Events der Serie
      const recurringGroupId =
        (crypto as any)?.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36);

      for (const req of group.items) {
        const dateOnly = req.startAt.slice(0, 10); // YYYY-MM-DD
        const start = new Date(dateOnly + "T00:00:00");
        start.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        const end = new Date(start.getTime() + durationMs);

        const body: any = {
          title: payload.title,
          pitch: payload.pitch,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          recurringGroupId,
        };
        if (payload.team !== undefined) body.team = payload.team;
        if (payload.adminNote) body.adminNote = payload.adminNote;

        const res = await fetch(`/api/admin/event-requests/${req.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Freigabe fehlgeschlagen");
        }
        await res.json();
      }
      return true;
    },
    onSuccess: () => {
      toast({ title: "Vorschlag freigegeben", description: "Das Training wurde in den Kalender übernommen." });
      setSelectedGroup(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message ?? "Freigabe fehlgeschlagen.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (input: { group: RequestGroup; adminNote?: string }) => {
      const { group, adminNote } = input;
      if (!group) throw new Error("No selection");

      for (const req of group.items) {
        const res = await fetch(`/api/admin/event-requests/${req.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "rejected", adminNote }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Ablehnung fehlgeschlagen");
        }
        await res.json();
      }
      return true;
    },
    onSuccess: () => {
      toast({ title: "Vorschlag abgelehnt" });
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
      payload: { title: string; pitch: Field; start: string; end: string; team?: Team };
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
        const dateOnly = req.startAt.slice(0, 10);
        const startAt = new Date(dateOnly + "T00:00:00");
        startAt.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        const endAt = new Date(startAt.getTime() + durationMs);
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
                <div className="font-medium">
                  {head.title}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({FIELD_LABELS[head.pitch]})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(head.startAt)} – {formatDateTime(head.endAt)}{" "}
                  {head.createdBy && `· ${head.createdBy}`}
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

      {selectedGroup && (
        <RequestDialog
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onSave={(payload) => saveMutation.mutate({ group: selectedGroup, payload })}
          onApprove={(payload) => approveMutation.mutate({ group: selectedGroup, payload })}
          onReject={(note) => rejectMutation.mutate({ group: selectedGroup, adminNote: note })}
          isSaving={saveMutation.isPending}
        />
      )}
    </div>
  );
}

interface RequestDialogProps {
  group: RequestGroup;
  onClose: () => void;
  onSave: (payload: { title: string; pitch: Field; start: string; end: string; team?: Team | "_none" }) => void;
  onApprove: (payload: { title: string; pitch: Field; start: string; end: string; team?: Team; adminNote?: string }) => void;
  onReject: (note?: string) => void;
  isSaving?: boolean;
}

function RequestDialog({ group, onClose, onSave, onApprove, onReject, isSaving = false }: RequestDialogProps) {
  const { head, count, items } = group;
  const [title, setTitle] = useState(head.title);
  const [pitch, setPitch] = useState<Field>(head.pitch);
  const [start, setStart] = useState(() => isoToDatetimeLocalBerlin(head.startAt));
  const [end, setEnd] = useState(() => isoToDatetimeLocalBerlin(head.endAt));
  const [team, setTeam] = useState<Team | "_none">((head.team as Team) || "_none");
  const [adminNote, setAdminNote] = useState(head.adminNote ?? "");

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
    });
  };

  const handleReject = () => {
    onReject(adminNote || undefined);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vorschlag prüfen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              Angelegt von {head.createdBy || "unbekannt"} am{" "}
              {formatDateTime(head.createdAt)}
            </div>
            {count > 1 && (
              <div>
                Serie mit {count} Terminen ·{" "}
                {new Date(items[0].startAt).toLocaleDateString("de-DE", { timeZone: TZ_BERLIN })} –{" "}
                {new Date(items[items.length - 1].startAt).toLocaleDateString("de-DE", { timeZone: TZ_BERLIN })}
              </div>
            )}
          </div>
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
        </div>
        <DialogFooter className="mt-4 flex-wrap gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Schließen
          </Button>
          <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Speichern…" : "Speichern"}
          </Button>
          <Button variant="destructive" onClick={handleReject} disabled={isSaving}>
            Ablehnen{count > 1 ? " (Serie)" : ""}
          </Button>
          <Button onClick={handleApprove} disabled={isSaving}>
            Freigeben &amp; eintragen{count > 1 ? " (Serie)" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


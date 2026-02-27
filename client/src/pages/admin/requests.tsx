import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventRequest } from "@shared/schema";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIELD_LABELS, FIELDS, type Field } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function RequestsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = useState<EventRequest | null>(null);

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

  const approveMutation = useMutation({
    mutationFn: async (payload: Partial<EventRequest>) => {
      if (!selected) throw new Error("No selection");
      const body: any = {};
      if (payload.title) body.title = payload.title;
      if (payload.pitch) body.pitch = payload.pitch;
      if (payload.startAt) body.startAt = payload.startAt;
      if (payload.endAt) body.endAt = payload.endAt;
      if (payload.adminNote) body.adminNote = payload.adminNote;
      const res = await fetch(`/api/admin/event-requests/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Freigabe fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vorschlag freigegeben", description: "Das Training wurde in den Kalender übernommen." });
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message ?? "Freigabe fehlgeschlagen.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (adminNote?: string) => {
      if (!selected) throw new Error("No selection");
      const res = await fetch(`/api/admin/event-requests/${selected.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "rejected", adminNote }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Ablehnung fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vorschlag abgelehnt" });
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message ?? "Ablehnung fehlgeschlagen.", variant: "destructive" });
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
            {isLoading ? "Lade Vorschläge..." : `${requests.length} Vorschlag${requests.length === 1 ? "" : "e"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Keine Vorschläge für den ausgewählten Status.</p>
          )}
          {requests.map((req) => (
            <button
              key={req.id}
              className="w-full text-left border rounded-md px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-3"
              onClick={() => setSelected(req)}
            >
              <div>
                <div className="font-medium">
                  {req.title}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({FIELD_LABELS[req.pitch]})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(req.startAt)} – {formatDateTime(req.endAt)}{" "}
                  {req.createdBy && `· ${req.createdBy}`}
                </div>
              </div>
              <Badge variant={req.status === "pending" ? "outline" : req.status === "approved" ? "default" : "destructive"}>
                {req.status === "pending" ? "Offen" : req.status === "approved" ? "Freigegeben" : "Abgelehnt"}
              </Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      {selected && (
        <RequestDialog
          request={selected}
          onClose={() => setSelected(null)}
          onApprove={(payload) => approveMutation.mutate(payload)}
          onReject={(note) => rejectMutation.mutate(note)}
        />
      )}
    </div>
  );
}

interface RequestDialogProps {
  request: EventRequest;
  onClose: () => void;
  onApprove: (payload: Partial<EventRequest>) => void;
  onReject: (note?: string) => void;
}

function RequestDialog({ request, onClose, onApprove, onReject }: RequestDialogProps) {
  const [title, setTitle] = useState(request.title);
  const [pitch, setPitch] = useState<Field>(request.pitch);
  const [start, setStart] = useState(request.startAt.slice(0, 16));
  const [end, setEnd] = useState(request.endAt.slice(0, 16));
  const [adminNote, setAdminNote] = useState(request.adminNote ?? "");

  const handleApprove = () => {
    onApprove({
      title,
      pitch,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      adminNote: adminNote || undefined,
    } as any);
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
          <div className="text-sm text-muted-foreground">
            Angelegt von {request.createdBy || "unbekannt"} am{" "}
            {formatDateTime(request.createdAt)}
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
            <Label>Notiz Betreuer</Label>
            <Textarea value={request.note ?? ""} readOnly />
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
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
          <Button variant="destructive" onClick={handleReject}>
            Ablehnen
          </Button>
          <Button onClick={handleApprove}>
            Freigeben &amp; eintragen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


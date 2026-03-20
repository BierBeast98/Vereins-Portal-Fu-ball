import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { CalendarEvent } from "@shared/schema";
import { FIELD_LABELS } from "@shared/schema";

interface EventActionDialogProps {
  event: CalendarEvent;
  mode: "delete" | "change";
  onClose: () => void;
}

export function EventActionDialog({ event, mode, onClose }: EventActionDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [newStartTime, setNewStartTime] = useState(event.startTime);
  const [newEndTime, setNewEndTime] = useState(event.endTime);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error("Bitte deinen Namen eingeben");
      }

      const startAt = new Date(event.date + "T" + (mode === "change" ? newStartTime : event.startTime) + ":00").toISOString();
      const endAt = new Date(event.date + "T" + (mode === "change" ? newEndTime : event.endTime) + ":00").toISOString();

      const body = {
        createdBy: name.trim(),
        type: mode === "delete" ? "delete_request" : "change_request",
        title: event.title,
        pitch: event.field ?? "a-platz",
        team: event.team,
        startAt,
        endAt,
        note: note.trim() || undefined,
        targetEventId: event.id,
      };

      const res = await fetch("/api/public/event-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Vorschlag konnte nicht gespeichert werden");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: mode === "delete" ? "Löschvorschlag gesendet" : "Änderungsvorschlag gesendet",
        description:
          mode === "delete"
            ? "Dein Vorschlag wurde gespeichert und muss vom Admin bestätigt werden."
            : "Deine Änderung wurde vorgeschlagen und muss vom Admin freigegeben werden.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Fehler",
        description: err.message ?? "Vorschlag konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  const fieldLabel = event.field ? (FIELD_LABELS[event.field] ?? event.field) : "–";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto w-[calc(100vw-2rem)] max-w-sm p-4">
        <DialogHeader>
          <DialogTitle>
            {mode === "delete" ? "Löschen vorschlagen" : "Änderung vorschlagen"}
          </DialogTitle>
        </DialogHeader>

        {/* Current event info */}
        <div className="rounded-lg bg-muted px-3 py-2.5 text-xs space-y-1 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Termin:</span> {event.title}
          </p>
          <p>
            <span className="font-medium text-foreground">Datum:</span> {event.date}
          </p>
          <p>
            <span className="font-medium text-foreground">Zeit:</span> {event.startTime} – {event.endTime}
          </p>
          <p>
            <span className="font-medium text-foreground">Platz:</span> {fieldLabel}
          </p>
        </div>

        {mode === "delete" && (
          <p className="text-sm text-destructive font-medium">
            Dieser Termin wird nach Admin-Bestätigung aus dem Kalender entfernt.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="action-name">Dein Name (Betreuer)</Label>
            <Input
              id="action-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Max Mustermann"
              required
            />
          </div>

          {mode === "change" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="action-start">Neue Startzeit</Label>
                <Input
                  id="action-start"
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="action-end">Neue Endzeit</Label>
                <Input
                  id="action-end"
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="action-note">
              {mode === "delete" ? "Begründung (optional)" : "Notiz / Begründung (optional)"}
            </Label>
            <Textarea
              id="action-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "delete"
                  ? "z. B. Platz wird anderweitig benötigt"
                  : "z. B. Zeitverschiebung wegen Schulveranstaltung"
              }
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              variant={mode === "delete" ? "destructive" : "default"}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Senden..."
                : mode === "delete"
                ? "Löschen vorschlagen"
                : "Änderung vorschlagen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

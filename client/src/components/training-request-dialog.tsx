import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FIELDS, FIELD_LABELS, type Field } from "@shared/schema";

interface TrainingRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultField?: Field;
}

export function TrainingRequestDialog({ open, onOpenChange, defaultDate, defaultField }: TrainingRequestDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState(120);
  const [field, setField] = useState<Field>(defaultField ?? "a-platz");
  const [title, setTitle] = useState("Training");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!date || !startTime) {
        throw new Error("Datum und Startzeit sind erforderlich");
      }
      setError(null);

      const [h, m] = startTime.split(":").map(Number);
      const startAt = new Date(date + "T00:00:00");
      startAt.setHours(h, m, 0, 0);
      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + duration);

      const body = {
        createdBy: name || undefined,
        type: "training",
        title,
        pitch: field,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        note: note || undefined,
      };

      const res = await fetch("/api/public/event-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = await res.json();
        setError(data?.message || "Konflikt mit bestehenden Terminen");
        throw new Error("CONFLICT");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Vorschlag konnte nicht gespeichert werden");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Vorschlag gespeichert",
        description: "Deine Trainingszeit wurde als Vorschlag gespeichert und muss vom Admin freigegeben werden.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
      onOpenChange(false);
      setError(null);
    },
    onError: (err: any) => {
      if (err.message === "CONFLICT") {
        toast({
          title: "Konflikt mit bestehendem Termin",
          description: "Bitte wähle eine andere Zeit ohne Überschneidung.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Fehler",
        description: err.message ?? "Vorschlag konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Training vorschlagen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Dein Name (Betreuer)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Max Mustermann"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Startzeit</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Dauer (Minuten)</Label>
              <Input
                id="duration"
                type="number"
                min={30}
                max={300}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 120)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Platz</Label>
              <Select value={field} onValueChange={(v) => setField(v as Field)}>
                <SelectTrigger>
                  <SelectValue placeholder="Platz wählen" />
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
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Notiz (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Mannschaft, Schwerpunkte, besondere Hinweise"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Speichern..." : "Vorschlag senden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


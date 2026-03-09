import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FIELDS, FIELD_LABELS, TEAMS, TEAM_LABELS, type Field, type Team } from "@shared/schema";

interface TrainingRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultField?: Field;
}

export function TrainingRequestDialog({ open, onOpenChange, defaultDate, defaultField }: TrainingRequestDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState(120);
  const [field, setField] = useState<Field>(defaultField ?? "a-platz");
  const [title, setTitle] = useState("Training");
  const [note, setNote] = useState("");
  const [team, setTeam] = useState<Team | undefined>(undefined);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState("");

  function handleClose(open: boolean) {
    if (!open) {
      setStep(1);
    }
    onOpenChange(open);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!date || !startTime) {
        throw new Error("Datum und Startzeit sind erforderlich");
      }
      if (repeatWeekly && !repeatUntil) {
        throw new Error("Bitte Enddatum für die Wiederholung angeben");
      }

      const [h, m] = startTime.split(":").map(Number);

      const firstDate = new Date(date + "T00:00:00");
      const untilDate = repeatWeekly && repeatUntil ? new Date(repeatUntil + "T23:59:59") : firstDate;

      const dates: Date[] = [];
      let cursor = new Date(firstDate);
      while (cursor <= untilDate) {
        dates.push(new Date(cursor));
        if (!repeatWeekly) break;
        cursor.setDate(cursor.getDate() + 7);
      }

      const created: unknown[] = [];

      for (const d of dates) {
        const startAt = new Date(d);
        startAt.setHours(h, m, 0, 0);
        const endAt = new Date(startAt);
        endAt.setMinutes(endAt.getMinutes() + duration);

        const body = {
          createdBy: name || undefined,
          type: "training",
          title,
          pitch: field,
          team,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          note: note || undefined,
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
        created.push(await res.json());
      }

      return created;
    },
    onSuccess: () => {
      toast({
        title: repeatWeekly ? "Vorschläge gespeichert" : "Vorschlag gespeichert",
        description: repeatWeekly
          ? "Deine wiederkehrenden Trainingszeiten wurden als Vorschläge gespeichert und müssen vom Admin freigegeben werden."
          : "Deine Trainingszeit wurde als Vorschlag gespeichert und muss vom Admin freigegeben werden.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/event-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/calendar/fields"] });
      handleClose(false);
    },
    onError: (err: any) => {
      toast({
        title: "Fehler",
        description: err.message ?? "Vorschlag konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  function handleNext(e: FormEvent) {
    e.preventDefault();
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto w-[calc(100vw-2rem)] max-w-sm p-4">
        <DialogHeader>
          <DialogTitle>Training vorschlagen</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                    ? "bg-primary/30 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div className={`h-px w-6 transition-colors ${s < step ? "bg-primary/50" : "bg-muted"}`} />
              )}
            </div>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">Schritt {step} von 3</span>
        </div>

        {/* Step 1: Name, Datum, Startzeit */}
        {step === 1 && (
          <form onSubmit={handleNext} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Dein Name (Betreuer)</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Max Mustermann"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Datum</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startTime">Startzeit</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Abbrechen
              </Button>
              <Button type="submit">Weiter</Button>
            </DialogFooter>
          </form>
        )}

        {/* Step 2: Dauer, Platz, Titel, Mannschaft, Wiederholung */}
        {step === 2 && (
          <form onSubmit={handleNext} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dauer (Min.)</Label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30, 60, 90, 120, 150, 180].map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} Min.</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Titel</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mannschaft</Label>
                <Select value={team ?? "_none"} onValueChange={(v) => setTeam(v === "_none" ? undefined : (v as Team))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Mannschaft" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine Angabe</SelectItem>
                    {TEAMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TEAM_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  id="repeatWeekly"
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input"
                  checked={repeatWeekly}
                  onChange={(e) => setRepeatWeekly(e.target.checked)}
                />
                <Label htmlFor="repeatWeekly" className="text-sm">
                  Wöchentlich wiederholen
                </Label>
              </div>
              {repeatWeekly && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Label htmlFor="repeatUntil" className="text-sm shrink-0">bis</Label>
                  <Input
                    id="repeatUntil"
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    required={repeatWeekly}
                    className="flex-1 min-w-0"
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleBack}>
                Zurück
              </Button>
              <Button type="submit">Weiter</Button>
            </DialogFooter>
          </form>
        )}

        {/* Step 3: Notiz + Absenden */}
        {step === 3 && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="note">Notiz (optional)</Label>
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="z. B. Schwerpunkte, besondere Hinweise"
              />
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted p-3 text-xs space-y-1 text-muted-foreground">
              <p><span className="font-medium text-foreground">Datum:</span> {date} um {startTime} Uhr</p>
              <p><span className="font-medium text-foreground">Dauer:</span> {duration} Min. · <span className="font-medium text-foreground">Platz:</span> {FIELD_LABELS[field]}</p>
              {team && <p><span className="font-medium text-foreground">Mannschaft:</span> {TEAM_LABELS[team]}</p>}
              {repeatWeekly && repeatUntil && <p><span className="font-medium text-foreground">Wiederholt bis:</span> {repeatUntil}</p>}
              {name && <p><span className="font-medium text-foreground">Betreuer:</span> {name}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleBack}>
                Zurück
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Speichern..." : "Vorschlag senden"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}



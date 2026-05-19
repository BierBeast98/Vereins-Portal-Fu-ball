import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  Festival,
  FestivalStation,
  FestivalShift,
  FestivalSignup,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Trash2, Pencil, Loader2, Download, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

type FullFestival = Festival & {
  stations: FestivalStation[];
  shifts: FestivalShift[];
  signups: FestivalSignup[];
};

export default function FestivalDetailPage() {
  const { festivalId } = useParams();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<FullFestival>({
    queryKey: [`/api/admin/festivals/${festivalId}/full`],
    enabled: !!festivalId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/festivals/${festivalId}/full`] });
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/festivals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-muted-foreground text-sm">
            {format(parseISO(data.startDate), "dd. MMM yyyy", { locale: de })}
            {data.startDate !== data.endDate &&
              ` – ${format(parseISO(data.endDate), "dd. MMM yyyy", { locale: de })}`}
            {data.location && ` · ${data.location}`}
          </p>
        </div>
      </div>

      <Tabs defaultValue="stations">
        <TabsList>
          <TabsTrigger value="stations">Stände</TabsTrigger>
          <TabsTrigger value="shifts">Schichten</TabsTrigger>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
        </TabsList>

        <TabsContent value="stations" className="mt-4">
          <StationsTab festival={data} onChanged={invalidate} toast={toast} />
        </TabsContent>

        <TabsContent value="shifts" className="mt-4">
          <ShiftsTab festival={data} onChanged={invalidate} toast={toast} />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab festival={data} onChanged={invalidate} toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// TAB: Stände
// ============================================================
function StationsTab({
  festival,
  onChanged,
  toast,
}: {
  festival: FullFestival;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) =>
      apiRequest("POST", `/api/admin/festivals/${festival.id}/stations`, data),
    onSuccess: () => {
      onChanged();
      setNewName("");
      setNewDescription("");
      toast({ title: "Stand hinzugefügt" });
    },
    onError: () => toast({ title: "Fehler", description: "Stand konnte nicht angelegt werden", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; description?: string } }) =>
      apiRequest("PATCH", `/api/admin/festival-stations/${id}`, data),
    onSuccess: () => {
      onChanged();
      setEditingId(null);
      toast({ title: "Stand aktualisiert" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/festival-stations/${id}`),
    onSuccess: () => {
      onChanged();
      setDeletingId(null);
      toast({ title: "Stand gelöscht" });
    },
  });

  const startEdit = (s: FestivalStation) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditDescription(s.description ?? "");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stände</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end border rounded-md p-3 bg-muted/30">
          <div className="flex-1">
            <Label htmlFor="station-name">Neuer Stand</Label>
            <Input
              id="station-name"
              placeholder="z. B. Ausschank"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="station-desc">Beschreibung (optional)</Label>
            <Input
              id="station-desc"
              placeholder="z. B. Getränke ausgeben"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
          <Button
            onClick={() =>
              newName.trim() &&
              createMutation.mutate({ name: newName.trim(), description: newDescription.trim() || undefined })
            }
            disabled={!newName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1">Hinzufügen</span>
          </Button>
        </div>

        {festival.stations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Noch keine Stände. Lege oben den ersten Stand an.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {festival.stations.map((s) => (
              <li key={s.id} className="p-3 flex items-center gap-3">
                {editingId === s.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="flex-1"
                      placeholder="Beschreibung"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({
                          id: s.id,
                          data: { name: editName.trim(), description: editDescription.trim() || undefined },
                        })
                      }
                    >
                      Speichern
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-medium">{s.name}</div>
                      {s.description && <div className="text-sm text-muted-foreground">{s.description}</div>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeletingId(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stand löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Alle Schichten und Helfer-Eintragungen für diesen Stand gehen verloren.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => deletingId && deleteMutation.mutate(deletingId)}>
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// ============================================================
// TAB: Schichten (Slot-Generator + Liste)
// ============================================================
function ShiftsTab({
  festival,
  onChanged,
  toast,
}: {
  festival: FullFestival;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  // Slot-Generator-Felder
  const today = new Date();
  const defaultDate = festival.startDate || today.toISOString().slice(0, 10);
  const [startInput, setStartInput] = useState(`${defaultDate}T14:00`);
  const [endInput, setEndInput] = useState(`${defaultDate}T22:00`);
  const [slotMinutes, setSlotMinutes] = useState(120);
  const [requiredHelpers, setRequiredHelpers] = useState(2);
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);

  const toggleStation = (id: string) =>
    setSelectedStationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const bulkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/festivals/${festival.id}/shifts/bulk`, {
        stationIds: selectedStationIds,
        startTime: new Date(startInput).toISOString(),
        endTime: new Date(endInput).toISOString(),
        slotDurationMinutes: slotMinutes,
        requiredHelpers,
      });
    },
    onSuccess: async (res) => {
      const created = await res.json().catch(() => []);
      onChanged();
      toast({
        title: "Schichten erzeugt",
        description: `${Array.isArray(created) ? created.length : 0} Slots angelegt.`,
      });
    },
    onError: () =>
      toast({
        title: "Fehler",
        description: "Slots konnten nicht erzeugt werden. Bitte Zeiten und Stände prüfen.",
        variant: "destructive",
      }),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/festival-shifts/${id}`),
    onSuccess: () => {
      onChanged();
      setDeletingShiftId(null);
      toast({ title: "Slot gelöscht" });
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { requiredHelpers?: number } }) =>
      apiRequest("PATCH", `/api/admin/festival-shifts/${id}`, data),
    onSuccess: () => {
      onChanged();
    },
  });

  // Gruppieren nach Stand
  const shiftsByStation = useMemo(() => {
    const map = new Map<string, FestivalShift[]>();
    for (const sh of festival.shifts) {
      const arr = map.get(sh.stationId) ?? [];
      arr.push(sh);
      map.set(sh.stationId, arr);
    }
    return map;
  }, [festival.shifts]);

  const signupCountByShift = useMemo(() => {
    const m = new Map<string, number>();
    for (const su of festival.signups) m.set(su.shiftId, (m.get(su.shiftId) ?? 0) + 1);
    return m;
  }, [festival.signups]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schichten erzeugen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Beginn</Label>
              <Input type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
            </div>
            <div>
              <Label>Ende</Label>
              <Input type="datetime-local" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
            </div>
            <div>
              <Label>Slot-Dauer (Minuten)</Label>
              <Input
                type="number"
                min={15}
                step={15}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(Math.max(15, parseInt(e.target.value || "0", 10)))}
              />
            </div>
            <div>
              <Label>Helfer pro Slot</Label>
              <Input
                type="number"
                min={1}
                value={requiredHelpers}
                onChange={(e) => setRequiredHelpers(Math.max(1, parseInt(e.target.value || "1", 10)))}
              />
            </div>
          </div>

          <div>
            <Label>Stände</Label>
            {festival.stations.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                Lege im Tab „Stände" zuerst mindestens einen Stand an.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 border rounded-md p-3">
                {festival.stations.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedStationIds.includes(s.id)}
                      onCheckedChange={() => toggleStation(s.id)}
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              disabled={
                bulkMutation.isPending ||
                selectedStationIds.length === 0 ||
                festival.stations.length === 0
              }
              onClick={() => bulkMutation.mutate()}
            >
              {bulkMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Schichten erzeugen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bestehende Schichten</CardTitle>
        </CardHeader>
        <CardContent>
          {festival.stations.length === 0 || festival.shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Schichten angelegt.</p>
          ) : (
            <div className="space-y-4">
              {festival.stations.map((station) => {
                const shifts = (shiftsByStation.get(station.id) ?? []).slice().sort(
                  (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
                );
                if (shifts.length === 0) return null;
                return (
                  <div key={station.id}>
                    <div className="font-medium mb-2">{station.name}</div>
                    <ul className="divide-y rounded-md border">
                      {shifts.map((sh) => {
                        const count = signupCountByShift.get(sh.id) ?? 0;
                        return (
                          <li key={sh.id} className="flex items-center gap-3 p-2 text-sm">
                            <div className="flex-1">
                              {format(parseISO(sh.startTime), "EEE dd.MM HH:mm", { locale: de })} –{" "}
                              {format(parseISO(sh.endTime), "HH:mm", { locale: de })}
                            </div>
                            <Badge variant={count >= sh.requiredHelpers ? "default" : count > 0 ? "secondary" : "outline"}>
                              {count}/{sh.requiredHelpers}
                            </Badge>
                            <div className="flex items-center gap-1">
                              <Label className="text-xs text-muted-foreground">Helfer:</Label>
                              <Input
                                type="number"
                                min={1}
                                className="w-16 h-8"
                                defaultValue={sh.requiredHelpers}
                                onBlur={(e) => {
                                  const v = Math.max(1, parseInt(e.target.value || "1", 10));
                                  if (v !== sh.requiredHelpers) {
                                    updateShiftMutation.mutate({ id: sh.id, data: { requiredHelpers: v } });
                                  }
                                }}
                              />
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => setDeletingShiftId(sh.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          <AlertDialog open={!!deletingShiftId} onOpenChange={() => setDeletingShiftId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Schicht löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Die Schicht und alle Helfer-Eintragungen dafür werden entfernt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={() => deletingShiftId && deleteShiftMutation.mutate(deletingShiftId)}>
                  Löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// TAB: Übersicht (Heatmap + CSV-Export)
// ============================================================
function OverviewTab({
  festival,
  onChanged,
  toast,
}: {
  festival: FullFestival;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [deletingSignupId, setDeletingSignupId] = useState<string | null>(null);

  const deleteSignupMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/festival-signups/${id}`),
    onSuccess: () => {
      onChanged();
      setDeletingSignupId(null);
      toast({ title: "Eintragung entfernt" });
    },
  });

  // Spalten = einzigartige Zeitslots (chronologisch). Wir bündeln Slots, die identische start/end haben, in eine Spalte.
  const timeColumns = useMemo(() => {
    const keys = new Map<string, { start: string; end: string }>();
    for (const sh of festival.shifts) {
      const key = `${sh.startTime}__${sh.endTime}`;
      if (!keys.has(key)) keys.set(key, { start: sh.startTime, end: sh.endTime });
    }
    return Array.from(keys.values()).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }, [festival.shifts]);

  // Für jede Zelle (station, timeKey) finden wir den passenden Shift + Signups.
  const shiftByCell = useMemo(() => {
    const m = new Map<string, FestivalShift>();
    for (const sh of festival.shifts) {
      m.set(`${sh.stationId}__${sh.startTime}__${sh.endTime}`, sh);
    }
    return m;
  }, [festival.shifts]);

  const signupsByShift = useMemo(() => {
    const m = new Map<string, FestivalSignup[]>();
    for (const su of festival.signups) {
      const arr = m.get(su.shiftId) ?? [];
      arr.push(su);
      m.set(su.shiftId, arr);
    }
    return m;
  }, [festival.signups]);

  const downloadCsv = () => {
    window.location.href = `/api/admin/festivals/${festival.id}/export.csv`;
  };

  if (festival.stations.length === 0 || festival.shifts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Sobald Stände und Schichten angelegt sind, erscheint hier die Übersicht.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Belegungs-Übersicht</CardTitle>
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-1" /> CSV exportieren
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs min-w-full">
          <thead>
            <tr>
              <th className="text-left p-2 sticky left-0 top-0 bg-background z-20">Zeit</th>
              {festival.stations.map((station) => (
                <th key={station.id} className="p-2 text-left whitespace-nowrap sticky top-0 bg-background z-10">
                  {station.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeColumns.map((col) => (
              <tr key={`${col.start}-${col.end}`}>
                <td className="font-medium p-2 sticky left-0 bg-background z-10 whitespace-nowrap align-top">
                  <div>{format(parseISO(col.start), "EEE dd.MM", { locale: de })}</div>
                  <div className="text-muted-foreground font-normal">
                    {format(parseISO(col.start), "HH:mm", { locale: de })}–
                    {format(parseISO(col.end), "HH:mm", { locale: de })}
                  </div>
                </td>
                {festival.stations.map((station) => {
                  const shift = shiftByCell.get(`${station.id}__${col.start}__${col.end}`);
                  if (!shift) {
                    return (
                      <td key={`${station.id}-${col.start}`} className="p-2 align-top">
                        <div className="rounded bg-muted/40 text-muted-foreground p-2 text-center">–</div>
                      </td>
                    );
                  }
                  const signups = signupsByShift.get(shift.id) ?? [];
                  const count = signups.length;
                  let color = "bg-red-100 dark:bg-red-950 border-red-300";
                  if (count >= shift.requiredHelpers) color = "bg-green-100 dark:bg-green-950 border-green-300";
                  else if (count > 0) color = "bg-yellow-100 dark:bg-yellow-950 border-yellow-300";
                  return (
                    <td key={shift.id} className="p-2 align-top">
                      <div className={`rounded border p-2 ${color} min-w-[140px]`}>
                        <div className="font-semibold mb-1">
                          {count}/{shift.requiredHelpers} Helfer
                        </div>
                        {signups.length === 0 ? (
                          <div className="text-muted-foreground italic">leer</div>
                        ) : (
                          <ul className="space-y-1">
                            {signups.map((su) => (
                              <li key={su.id} className="flex items-center justify-between gap-1">
                                <div className="min-w-0">
                                  <div className="truncate">{su.helperName}</div>
                                  {su.helperPhone && (
                                    <div className="text-muted-foreground truncate">{su.helperPhone}</div>
                                  )}
                                </div>
                                <button
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeletingSignupId(su.id)}
                                  title="Eintragung entfernen"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <AlertDialog open={!!deletingSignupId} onOpenChange={() => setDeletingSignupId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eintragung entfernen?</AlertDialogTitle>
              <AlertDialogDescription>
                Der Helfer wird aus dieser Schicht ausgetragen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => deletingSignupId && deleteSignupMutation.mutate(deletingSignupId)}>
                Entfernen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

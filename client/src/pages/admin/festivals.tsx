import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Festival, InsertFestival } from "@shared/schema";
import { insertFestivalSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import {
  Plus,
  Pencil,
  Trash2,
  PartyPopper,
  Copy,
  Loader2,
  Lock,
  Settings,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isPast, isWithinInterval, parseISO } from "date-fns";
import { de } from "date-fns/locale";

export default function FestivalsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Festival | null>(null);
  const [deleting, setDeleting] = useState<Festival | null>(null);

  const { data: festivals, isLoading } = useQuery<Festival[]>({
    queryKey: ["/api/admin/festivals"],
  });

  const form = useForm<InsertFestival>({
    resolver: zodResolver(insertFestivalSchema),
    defaultValues: {
      name: "",
      description: "",
      location: "",
      startDate: "",
      endDate: "",
      active: true,
      password: "",
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/festivals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/festivals/active"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertFestival) =>
      apiRequest("POST", "/api/admin/festivals", data),
    onSuccess: () => {
      invalidate();
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Fest angelegt" });
    },
    onError: () => toast({ title: "Fehler", description: "Fest konnte nicht angelegt werden", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertFestival> }) =>
      apiRequest("PATCH", `/api/admin/festivals/${id}`, data),
    onSuccess: () => {
      invalidate();
      setIsDialogOpen(false);
      setEditing(null);
      form.reset();
      toast({ title: "Fest aktualisiert" });
    },
    onError: () => toast({ title: "Fehler", description: "Fest konnte nicht aktualisiert werden", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/festivals/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast({ title: "Fest gelöscht" });
    },
    onError: () => toast({ title: "Fehler", description: "Fest konnte nicht gelöscht werden", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/admin/festivals/${id}`, { active }),
    onSuccess: () => invalidate(),
  });

  const removePasswordMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("PATCH", `/api/admin/festivals/${id}`, { password: "" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Passwortschutz entfernt" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: "",
      description: "",
      location: "",
      startDate: "",
      endDate: "",
      active: true,
      password: "",
    });
    setIsDialogOpen(true);
  };

  const openEdit = (festival: Festival) => {
    setEditing(festival);
    form.reset({
      name: festival.name,
      description: festival.description,
      location: festival.location,
      startDate: festival.startDate,
      endDate: festival.endDate,
      active: festival.active,
      password: "", // bewusst leer: nur überschreiben, wenn der Admin etwas eintippt
    });
    setIsDialogOpen(true);
  };

  const copySignupLink = (id: string) => {
    const link = `${window.location.origin}/festival/${id}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link kopiert", description: "Eintragungslink in der Zwischenablage." });
  };

  const onSubmit = (data: InsertFestival) => {
    // Beim Edit: leeres Passwort-Feld = nicht ändern. Wer Schutz entfernen will, nutzt den eigenen Button.
    const payload: Partial<InsertFestival> = {
      ...data,
      password: data.password && data.password.length > 0 ? data.password : undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload as InsertFestival);
    }
  };

  const statusOf = (f: Festival) => {
    const now = new Date();
    const start = parseISO(f.startDate);
    const end = parseISO(f.endDate + "T23:59:59");
    if (!f.active) return { label: "Inaktiv", variant: "secondary" as const };
    if (isPast(end)) return { label: "Beendet", variant: "outline" as const };
    if (isWithinInterval(now, { start, end })) return { label: "Läuft", variant: "default" as const };
    return { label: "Geplant", variant: "secondary" as const };
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Feste</h1>
          <p className="text-muted-foreground">
            Helfer-Schichtpläne für Vereinsfeste. Stände und Schichten verwaltest du in der Detailansicht.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Neues Fest
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Fest bearbeiten" : "Neues Fest anlegen"}</DialogTitle>
              <DialogDescription>
                Stammdaten des Festes – Stände und Schichten kannst du danach in der Detailansicht hinzufügen.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="z. B. Sommerfest 2026" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beschreibung</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Kurze Info für Helfer (optional)"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ort</FormLabel>
                      <FormControl>
                        <Input placeholder="z. B. Sportplatz Greding" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Startdatum *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enddatum *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Passwort (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder={editing?.hasPassword ? "(leer lassen = unverändert)" : "Leer lassen für offenes Fest"}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Wenn gesetzt, müssen Helfer das Passwort eingeben, bevor sie sich eintragen können.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-4">
                      <div>
                        <FormLabel>Aktiv</FormLabel>
                        <FormDescription>
                          Nur aktive Feste werden auf der Startseite und zur Eintragung angezeigt.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editing ? "Speichern" : "Anlegen"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : festivals && festivals.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {festivals.map((f) => {
            const status = statusOf(f);
            return (
              <Card key={f.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {f.name}
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {f.hasPassword && (
                          <Badge variant="outline" className="gap-1">
                            <Lock className="h-3 w-3" /> Passwort
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {format(parseISO(f.startDate), "dd. MMM yyyy", { locale: de })}
                        {f.startDate !== f.endDate &&
                          ` – ${format(parseISO(f.endDate), "dd. MMM yyyy", { locale: de })}`}
                        {f.location && ` · ${f.location}`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {f.description && (
                  <CardContent className="text-sm text-muted-foreground">{f.description}</CardContent>
                )}
                <CardFooter className="flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Aktiv:</span>
                    <Switch
                      checked={f.active}
                      onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: f.id, active: checked })}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/admin/festivals/${f.id}`}>
                      <Button size="sm" variant="outline">
                        <Settings className="h-4 w-4 mr-1" /> Stände & Schichten
                      </Button>
                    </Link>
                    <Button size="icon" variant="ghost" onClick={() => copySignupLink(f.id)} title="Eintragungslink kopieren">
                      <Copy className="h-4 w-4" />
                    </Button>
                    {f.hasPassword && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePasswordMutation.mutate(f.id)}
                        title="Passwortschutz entfernen"
                      >
                        <Lock className="h-4 w-4 text-amber-500" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => openEdit(f)} title="Bearbeiten">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(f)} title="Löschen">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <PartyPopper className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Noch keine Feste angelegt</h3>
            <p className="text-muted-foreground text-center mb-4">
              Lege dein erstes Fest an, danach kannst du Stände und Schichten verwalten.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Neues Fest
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fest löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Fest „{deleting?.name}" wird unwiderruflich gelöscht. Alle Stände, Schichten und
              Helfer-Eintragungen gehen mit verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

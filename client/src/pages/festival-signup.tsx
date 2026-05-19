import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type {
  Festival,
  FestivalStation,
  FestivalShift,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Home, Loader2, Lock, MapPin, CalendarDays, Check, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

type FestivalDetails = Festival & {
  stations: FestivalStation[];
  shifts: Array<FestivalShift & { signedUpCount: number }>;
};

const signupFormSchema = z.object({
  helperName: z.string().min(1, "Bitte deinen Namen eintragen"),
  notes: z.string().optional(),
});
type SignupFormValues = z.infer<typeof signupFormSchema>;

export default function FestivalSignupPage() {
  const { festivalId } = useParams<{ festivalId: string }>();
  const { toast } = useToast();

  const passwordKey = `festival_password_${festivalId}`;
  const [enteredPassword, setEnteredPassword] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(passwordKey);
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [openShift, setOpenShift] = useState<{ shift: FestivalShift; stationName: string } | null>(null);
  const [doneShiftIds, setDoneShiftIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<FestivalDetails>({
    queryKey: [`/api/festivals/${festivalId}`],
    enabled: !!festivalId,
  });

  const verifyPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/festivals/verify-password", {
        festivalId,
        password,
      });
      return res.json();
    },
    onSuccess: (_data, password) => {
      window.sessionStorage.setItem(passwordKey, password);
      setEnteredPassword(password);
      setPasswordError(null);
    },
    onError: () => {
      setPasswordError("Das Passwort stimmt nicht. Bitte erneut versuchen.");
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (vals: SignupFormValues & { shiftId: string }) => {
      const res = await apiRequest("POST", `/api/festivals/${festivalId}/signups`, {
        shiftId: vals.shiftId,
        helperName: vals.helperName,
        notes: vals.notes,
        festivalPassword: enteredPassword ?? undefined,
      });
      return res.json();
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/festivals/${festivalId}`] });
      setDoneShiftIds((prev) => new Set(prev).add(vars.shiftId));
      setOpenShift(null);
      toast({
        title: "Danke fürs Eintragen!",
        description: "Wir sehen uns – deine Anmeldung ist gespeichert.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Eintragung nicht möglich",
        description: err?.message || "Bitte später erneut versuchen.",
        variant: "destructive",
      });
    },
  });

  // Wenn das Fest kein Passwort verlangt, aus dem sessionStorage ggf. aufräumen.
  useEffect(() => {
    if (data && !data.hasPassword) {
      setEnteredPassword((p) => p ?? "");
    }
  }, [data]);

  // Zeitspalten gruppieren (gleiche start/end → eine Spalte)
  const timeColumns = useMemo(() => {
    if (!data) return [];
    const keys = new Map<string, { start: string; end: string }>();
    for (const sh of data.shifts) {
      const key = `${sh.startTime}__${sh.endTime}`;
      if (!keys.has(key)) keys.set(key, { start: sh.startTime, end: sh.endTime });
    }
    return Array.from(keys.values()).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }, [data]);

  const shiftLookup = useMemo(() => {
    const m = new Map<string, FestivalShift & { signedUpCount: number }>();
    if (!data) return m;
    for (const sh of data.shifts) m.set(`${sh.stationId}__${sh.startTime}__${sh.endTime}`, sh);
    return m;
  }, [data]);

  // ----- Render-Branches -----

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <Card>
          <CardContent className="py-10 space-y-3">
            <h2 className="text-xl font-semibold">Fest nicht gefunden</h2>
            <p className="text-muted-foreground">Der Link ist nicht mehr gültig.</p>
            <Link href="/">
              <Button variant="outline">
                <Home className="h-4 w-4 mr-1" /> Zur Startseite
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Passwort-Gate, falls notwendig
  if (data.hasPassword && enteredPassword === null) {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {data.name}
            </CardTitle>
            <CardDescription>Dieses Fest ist passwortgeschützt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="Passwort"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passwordInput) verifyPasswordMutation.mutate(passwordInput);
              }}
            />
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            <Button
              className="w-full"
              disabled={!passwordInput || verifyPasswordMutation.isPending}
              onClick={() => verifyPasswordMutation.mutate(passwordInput)}
            >
              {verifyPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Weiter
            </Button>
            <div className="text-center">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <Home className="h-4 w-4 mr-1" /> Zur Startseite
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasShifts = data.shifts.length > 0;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <Home className="h-4 w-4 mr-1" /> Startseite
            </Button>
          </Link>
        </div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <div className="flex flex-wrap gap-3 text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            {format(parseISO(data.startDate), "dd. MMM yyyy", { locale: de })}
            {data.startDate !== data.endDate &&
              ` – ${format(parseISO(data.endDate), "dd. MMM yyyy", { locale: de })}`}
          </span>
          {data.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {data.location}
            </span>
          )}
        </div>
        {data.description && <p className="mt-3 text-muted-foreground">{data.description}</p>}
      </div>

      {!hasShifts ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aktuell sind noch keine Schichten freigegeben. Schau bitte später nochmal vorbei.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-4 overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border bg-red-100 dark:bg-red-950 border-red-300" />
                Noch keine Helfer
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border bg-yellow-100 dark:bg-yellow-950 border-yellow-300" />
                Teilweise besetzt
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border bg-green-100 dark:bg-green-950 border-green-300" />
                Voll besetzt
              </span>
            </div>
            <table className="border-separate border-spacing-1 text-xs min-w-full">
              <thead>
                <tr>
                  <th className="text-left p-2 sticky left-0 top-0 bg-background z-20">Zeit</th>
                  {data.stations.map((station) => (
                    <th key={station.id} className="p-2 text-left whitespace-nowrap sticky top-0 bg-background z-10">
                      <div>{station.name}</div>
                      {station.description && (
                        <div className="text-muted-foreground font-normal text-[11px]">
                          {station.description}
                        </div>
                      )}
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
                    {data.stations.map((station) => {
                      const shift = shiftLookup.get(`${station.id}__${col.start}__${col.end}`);
                      if (!shift) {
                        return (
                          <td key={`${station.id}-${col.start}`} className="p-2 align-top">
                            <div className="rounded bg-muted/40 text-muted-foreground p-2 text-center min-w-[110px]">
                              –
                            </div>
                          </td>
                        );
                      }
                      const count = shift.signedUpCount;
                      const full = count >= shift.requiredHelpers;
                      const alreadyDone = doneShiftIds.has(shift.id);
                      let color = "bg-red-100 dark:bg-red-950 border-red-300";
                      if (full) color = "bg-green-100 dark:bg-green-950 border-green-300";
                      else if (count > 0) color = "bg-yellow-100 dark:bg-yellow-950 border-yellow-300";
                      return (
                        <td key={shift.id} className="p-1 align-top">
                          <div
                            className={`rounded border p-1.5 min-w-[110px] flex flex-col gap-1 ${color} ${
                              alreadyDone ? "ring-2 ring-emerald-500" : ""
                            }`}
                          >
                            <div className="font-semibold whitespace-nowrap text-center">
                              {count}/{shift.requiredHelpers}
                            </div>
                            {shift.signedUpNames.length > 0 && (
                              <ul className="text-[11px] leading-tight space-y-0.5">
                                {shift.signedUpNames.map((name, i) => (
                                  <li key={i} className="truncate" title={name}>
                                    • {name}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {alreadyDone ? (
                              <div className="text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1 text-[11px]">
                                <Check className="h-3 w-3" /> dabei
                              </div>
                            ) : full ? (
                              <div className="text-[11px] text-muted-foreground italic text-center">voll</div>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 px-1 text-xs w-full"
                                onClick={() =>
                                  setOpenShift({ shift, stationName: station.name })
                                }
                              >
                                <Plus className="h-3 w-3 mr-0.5" /> Eintragen
                              </Button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <SignupDialog
        open={!!openShift}
        onClose={() => setOpenShift(null)}
        shiftInfo={openShift}
        isSubmitting={signupMutation.isPending}
        onSubmit={(vals) => {
          if (!openShift) return;
          signupMutation.mutate({ ...vals, shiftId: openShift.shift.id });
        }}
      />
    </div>
  );
}

function SignupDialog({
  open,
  onClose,
  shiftInfo,
  isSubmitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  shiftInfo: { shift: FestivalShift; stationName: string } | null;
  isSubmitting: boolean;
  onSubmit: (values: SignupFormValues) => void;
}) {
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { helperName: "", notes: "" },
  });

  useEffect(() => {
    if (open) form.reset({ helperName: "", notes: "" });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Als Helfer eintragen</DialogTitle>
          {shiftInfo && (
            <DialogDescription>
              {shiftInfo.stationName} ·{" "}
              {format(parseISO(shiftInfo.shift.startTime), "EEE dd.MM HH:mm", { locale: de })}
              {" – "}
              {format(parseISO(shiftInfo.shift.endTime), "HH:mm", { locale: de })}
            </DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="helperName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Vor- und Nachname" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notiz (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="z. B. „komme erst 14:30"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Eintragen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Download, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ImportRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  source: string;
  createdCount: number;
  updatedCount: number;
  archivedCount: number;
  errors: string[];
  warnings: unknown[];
}

interface ImportWarning {
  id: string;
  importRunId: string;
  type: string;
  message: string;
  eventRefs: unknown;
  createdAt: string;
}

export default function BfvImportPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading } = useQuery<{ running: boolean; bfvUrlConfigured: boolean }>({
    queryKey: ["/api/calendar/bfv-import/status"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/bfv-import/status", { credentials: "include" });
      if (!res.ok) throw new Error("Status fehlgeschlagen");
      return res.json();
    },
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery<ImportRun[]>({
    queryKey: ["/api/calendar/bfv-import/runs"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/bfv-import/runs", { credentials: "include" });
      if (!res.ok) throw new Error("Läufe konnten nicht geladen werden");
      return res.json();
    },
  });

  const { data: warnings = [] } = useQuery<ImportWarning[]>({
    queryKey: ["/api/calendar/bfv-import/warnings"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/bfv-import/warnings", { credentials: "include" });
      if (!res.ok) throw new Error("Hinweise konnten nicht geladen werden");
      return res.json();
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/calendar/bfv-import/run", {});
    },
    onSuccess: (data: { ok?: boolean; message?: string; runId?: string; errors?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/bfv-import/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/bfv-import/warnings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      if (data.ok) {
        toast({ title: "Import abgeschlossen", description: data.message });
      } else {
        toast({ title: "Import fehlgeschlagen", description: data.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Import fehlgeschlagen", description: err.message, variant: "destructive" });
    },
  });

  const running = status?.running ?? false;
  const bfvConfigured = status?.bfvUrlConfigured ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">BFV-Import</h1>
        <p className="text-muted-foreground">
          Spiele von der BFV-Vereinsseite in den Jahreskalender und die Platzbelegung übernehmen. Import läuft automatisch alle 24 Stunden.
        </p>
      </div>

      {!bfvConfigured && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              BFV_URL nicht konfiguriert
            </CardTitle>
            <CardDescription>
              Setzen Sie die Umgebungsvariable BFV_URL auf die Spielplan-URL (z. B. Vereinsseite oder ICS-Link).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Jetzt importieren</CardTitle>
          <CardDescription>
            Import manuell auslösen. Bereits vorhandene Spiele werden aktualisiert, fehlende archiviert. Verschobene Spiele werden erkannt und als Hinweis angezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={running || importMutation.isPending || !bfvConfigured}
            data-testid="button-bfv-import-now"
          >
            {importMutation.isPending || running ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {running ? "Import läuft…" : importMutation.isPending ? "Import wird ausgeführt…" : "Jetzt importieren"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Import-Läufe</CardTitle>
          <CardDescription>Übersicht der letzten automatischen und manuellen Importe.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <p className="text-muted-foreground">Lade…</p>
          ) : runs.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Import-Läufe.</p>
          ) : (
            <ul className="space-y-3">
              {runs.slice(0, 15).map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 text-sm border-b pb-2 last:border-0">
                  <span className="text-muted-foreground">
                    {run.startedAt ? format(new Date(run.startedAt), "dd.MM.yyyy HH:mm", { locale: de }) : "–"}
                  </span>
                  {!run.finishedAt && <Badge variant="secondary">Läuft</Badge>}
                  <Badge variant="outline">{run.createdCount} neu</Badge>
                  <Badge variant="outline">{run.updatedCount} aktualisiert</Badge>
                  <Badge variant="outline">{run.archivedCount} archiviert</Badge>
                  {(run.errors?.length ?? 0) > 0 && (
                    <Badge variant="destructive">{run.errors!.length} Fehler</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Hinweise (z. B. Verlegungen)
            </CardTitle>
            <CardDescription>Meldungen aus den letzten Import-Läufen.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {warnings.slice(0, 20).map((w) => (
                <li key={w.id} className="text-sm p-2 rounded bg-muted/50">
                  <span className="font-medium">{w.type}:</span> {w.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

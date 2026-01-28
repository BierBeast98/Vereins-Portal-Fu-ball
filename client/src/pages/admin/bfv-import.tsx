import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ExternalLink,
  Calendar,
  CheckCircle,
  FileText,
  Download
} from "lucide-react";
import type { BfvImportConfig, CalendarEvent } from "@shared/schema";
import { TEAMS, TEAM_LABELS } from "@shared/schema";

const CURRENT_SEASON = "2025/2026";

const BFV_VEREIN_URL = "https://www.bfv.de/vereine/tsv-greding/00ES8GNKJO000005VV0AG08LVUPGND5I";

const BFV_TEAM_URLS: Record<string, string> = {
  "herren": "https://www.bfv.de/mannschaften/tsv-greding/016N8L1P5G000000VV0AG811VSQHS8RV",
  "herren2": "https://www.bfv.de/mannschaften/tsv-greding-ii/0165MHSGLG000000VV0AG811VT4P8VCT",
};

export default function BfvImportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>("herren");
  const [customUrl, setCustomUrl] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: configs = [], isLoading: configsLoading } = useQuery<BfvImportConfig[]>({
    queryKey: ["/api/calendar/bfv-configs"],
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
  });

  const importedEvents = events.filter((e) => e.bfvImported);

  const createConfigMutation = useMutation({
    mutationFn: async (data: { team: string; bfvTeamUrl: string; season: string }) => {
      return apiRequest("POST", "/api/calendar/bfv-configs", {
        ...data,
        active: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/bfv-configs"] });
      toast({ title: "BFV-Konfiguration erstellt" });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Fehler beim Erstellen", variant: "destructive" });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/calendar/bfv-configs/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/bfv-configs"] });
      toast({ title: "Konfiguration gelöscht" });
    },
  });

  const importMatchesMutation = useMutation({
    mutationFn: async (configId: string) => {
      setImporting(configId);
      const response = await apiRequest("POST", `/api/calendar/bfv-import/${configId}`, {});
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/bfv-configs"] });
      
      let description = "";
      if (data.imported > 0) {
        description += `${data.imported} neue Spiele importiert`;
      }
      if (data.updated > 0) {
        description += description ? `, ${data.updated} aktualisiert` : `${data.updated} Spiele aktualisiert`;
      }
      if (data.imported === 0 && data.updated === 0) {
        description = "Keine neuen Spiele gefunden";
      }
      if (data.usedSampleData) {
        description += " (Demo-Daten)";
      }
      
      toast({ 
        title: data.fetchError ? "Import mit Einschränkungen" : "Import erfolgreich", 
        description,
      });
      
      if (data.fetchError) {
        toast({
          title: "Hinweis",
          description: data.fetchError + " - Demo-Daten wurden verwendet",
        });
      }
      
      setImporting(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Import fehlgeschlagen", 
        description: error.message || "Bitte versuchen Sie es später erneut",
        variant: "destructive" 
      });
      setImporting(null);
    },
  });

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Bitte eine PDF-Datei auswählen", variant: "destructive" });
      return;
    }

    setUploadingPdf(true);
    
    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/calendar/bfv-import-pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload fehlgeschlagen");
      }

      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      
      let description = "";
      if (data.imported > 0) {
        description += `${data.imported} neue Spiele importiert`;
      }
      if (data.updated > 0) {
        description += description ? `, ${data.updated} aktualisiert` : `${data.updated} Spiele aktualisiert`;
      }
      if (data.imported === 0 && data.updated === 0) {
        description = "Keine Spiele in der PDF gefunden";
      }
      
      toast({ 
        title: "PDF-Import erfolgreich", 
        description: description + ` (${data.total} Spiele erkannt)`,
      });
    } catch (error: any) {
      toast({ 
        title: "PDF-Import fehlgeschlagen", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAddConfig = () => {
    const url = customUrl || BFV_TEAM_URLS[selectedTeam] || "";
    if (!url) {
      toast({ title: "Bitte BFV-URL eingeben", variant: "destructive" });
      return;
    }
    createConfigMutation.mutate({
      team: selectedTeam,
      bfvTeamUrl: url,
      season: CURRENT_SEASON,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">BFV-Import</h1>
          <p className="text-muted-foreground">
            Spielpläne vom Bayerischen Fußball-Verband importieren
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PDF-Import (Empfohlen)
          </CardTitle>
          <CardDescription>
            Laden Sie den Vereinsspielplan als PDF von der BFV-Webseite herunter und importieren Sie ihn hier.
            Alle Mannschaften werden automatisch erkannt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="pdf-upload" className="sr-only">PDF hochladen</Label>
              <Input
                id="pdf-upload"
                type="file"
                accept=".pdf"
                ref={fileInputRef}
                onChange={handlePdfUpload}
                disabled={uploadingPdf}
                className="cursor-pointer"
                data-testid="input-pdf-upload"
              />
            </div>
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf}
              data-testid="button-upload-pdf"
            >
              {uploadingPdf ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Importiere...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  PDF hochladen
                </>
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="h-4 w-4" />
            <span>PDF herunterladen von:</span>
            <a 
              href={BFV_VEREIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              BFV TSV Greding Vereinsseite
            </a>
          </div>

          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <p className="font-medium mb-1">So funktioniert's:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Öffnen Sie die BFV-Vereinsseite (Link oben)</li>
              <li>Klicken Sie auf "Vereinsspielplan" oder "Spielplan drucken"</li>
              <li>Wählen Sie den gewünschten Zeitraum</li>
              <li>Laden Sie die PDF herunter</li>
              <li>Laden Sie die PDF hier hoch</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importierte Spiele</CardTitle>
          <CardDescription>
            {importedEvents.length} Spiele aus BFV-Daten importiert
          </CardDescription>
        </CardHeader>
        <CardContent>
          {importedEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Noch keine Spiele importiert. Laden Sie eine PDF hoch um zu starten.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {importedEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    data-testid={`imported-event-${event.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        <span className="font-medium">
                          {new Date(event.date).toLocaleDateString("de-DE", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                        <span className="text-muted-foreground ml-2">{event.startTime}</span>
                      </div>
                      <div>
                        <span className="font-medium">{event.title}</span>
                        {event.competition && (
                          <span className="text-muted-foreground text-sm ml-2">
                            ({event.competition})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.team && (
                        <Badge variant="secondary">{TEAM_LABELS[event.team]}</Badge>
                      )}
                      {event.isHomeGame && (
                        <Badge className="bg-green-500 text-white">Heim</Badge>
                      )}
                      {event.isHomeGame === false && (
                        <Badge variant="outline">Auswärts</Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Einzelne Mannschaft importieren</CardTitle>
          <CardDescription>
            Alternativ können Sie auch nur eine bestimmte Mannschaft importieren
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-add-config">
                  <Plus className="h-4 w-4 mr-2" />
                  Mannschaft hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>BFV-Import konfigurieren</DialogTitle>
                  <DialogDescription>
                    Wählen Sie eine Mannschaft für den Import aus
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="team">Mannschaft</Label>
                    <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                      <SelectTrigger data-testid="select-team">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAMS.map((team) => (
                          <SelectItem key={team} value={team}>
                            {TEAM_LABELS[team]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="url">BFV-URL (optional)</Label>
                    <Input
                      id="url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder={BFV_TEAM_URLS[selectedTeam] || "https://www.bfv.de/mannschaften/..."}
                      data-testid="input-bfv-url"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leer lassen für Standard-URL (Herren/Herren II)
                    </p>
                  </div>

                  <Button 
                    onClick={handleAddConfig} 
                    className="w-full"
                    disabled={createConfigMutation.isPending}
                    data-testid="button-save-config"
                  >
                    Konfiguration speichern
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {configs.length > 0 && (
            <div className="space-y-2">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-3 rounded-md border"
                  data-testid={`config-${config.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{TEAM_LABELS[config.team]}</p>
                      <p className="text-sm text-muted-foreground">
                        Saison {config.season}
                        {config.lastImport && (
                          <span>
                            {" · Letzter Import: "}
                            {new Date(config.lastImport).toLocaleDateString("de-DE")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => importMatchesMutation.mutate(config.id)}
                      disabled={importing === config.id}
                      data-testid={`button-import-${config.id}`}
                    >
                      {importing === config.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-1" />
                          Importieren
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteConfigMutation.mutate(config.id)}
                      data-testid={`button-delete-${config.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

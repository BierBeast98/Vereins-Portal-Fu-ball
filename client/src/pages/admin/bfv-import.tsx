import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Download, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ExternalLink,
  Calendar,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import type { BfvImportConfig, CalendarEvent } from "@shared/schema";
import { TEAMS, TEAM_LABELS } from "@shared/schema";

const CURRENT_SEASON = "2025/2026";

const BFV_TEAM_URLS: Record<string, string> = {
  "herren": "https://www.bfv.de/mannschaften/tsv-greding/016N8L1P5G000000VV0AG811VSQHS8RV",
  "herren2": "https://www.bfv.de/mannschaften/tsv-greding-ii/0165MHSGLG000000VV0AG811VT4P8VCT",
};

interface BfvMatch {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  isHome: boolean;
  location?: string;
  bfvMatchId: string;
}

export default function BfvImportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>("herren");
  const [customUrl, setCustomUrl] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

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
      toast({ 
        title: "Import erfolgreich", 
        description: `${data.imported || 0} Spiele importiert` 
      });
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
            Spieltermine von BFV.de für TSV Greding importieren
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-bfv-config">
              <Plus className="h-4 w-4 mr-2" />
              Mannschaft hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>BFV-Import konfigurieren</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Mannschaft</Label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger data-testid="select-bfv-team">
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
                <Label>BFV-Mannschafts-URL</Label>
                <Input
                  value={customUrl || BFV_TEAM_URLS[selectedTeam] || ""}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://www.bfv.de/mannschaften/..."
                  data-testid="input-bfv-url"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL der Mannschaftsseite auf bfv.de
                </p>
              </div>

              <div>
                <Label>Saison</Label>
                <Input value={CURRENT_SEASON} disabled />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleAddConfig}
                  disabled={createConfigMutation.isPending}
                  data-testid="button-save-bfv-config"
                >
                  Speichern
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">TSV Greding - Mannschaften</CardTitle>
          <CardDescription>
            Konfigurierte Mannschaften für den automatischen Spielplan-Import
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Mannschaften konfiguriert</p>
              <p className="text-sm">Fügen Sie eine Mannschaft hinzu, um Spieltermine zu importieren</p>
            </div>
          ) : (
            <div className="space-y-4">
              {configs.map((config) => {
                const teamEvents = importedEvents.filter((e) => e.team === config.team);
                const isImporting = importing === config.id;
                
                return (
                  <div 
                    key={config.id} 
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`bfv-config-${config.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{TEAM_LABELS[config.team]}</span>
                        <Badge variant="outline">{config.season}</Badge>
                        {config.active ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Aktiv
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-100">
                            Inaktiv
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {teamEvents.length} importierte Spiele
                        {config.lastImport && (
                          <span className="ml-2">
                            | Letzter Import: {new Date(config.lastImport).toLocaleDateString("de-DE")}
                          </span>
                        )}
                      </div>
                      <a 
                        href={config.bfvTeamUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        BFV-Seite öffnen
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => importMatchesMutation.mutate(config.id)}
                        disabled={isImporting}
                        data-testid={`button-import-${config.id}`}
                      >
                        {isImporting ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Importieren
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteConfigMutation.mutate(config.id)}
                        disabled={deleteConfigMutation.isPending}
                        data-testid={`button-delete-config-${config.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Importierte Spiele</CardTitle>
          <CardDescription>
            Alle von BFV importierten Spieltermine
          </CardDescription>
        </CardHeader>
        <CardContent>
          {importedEvents.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              Noch keine Spiele importiert
            </p>
          ) : (
            <div className="space-y-2">
              {importedEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 20)
                .map((event) => (
                  <div 
                    key={event.id}
                    className="flex items-center justify-between p-3 border rounded-lg text-sm"
                    data-testid={`imported-event-${event.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-16 text-muted-foreground">
                        {new Date(event.date).toLocaleDateString("de-DE", { 
                          day: "2-digit", 
                          month: "2-digit" 
                        })}
                      </div>
                      <div className="w-12 text-muted-foreground">
                        {event.startTime}
                      </div>
                      <div className="font-medium">{event.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.isHomeGame ? (
                        <Badge variant="secondary">Heim</Badge>
                      ) : (
                        <Badge variant="outline">Auswärts</Badge>
                      )}
                      <Badge variant="outline">{event.competition}</Badge>
                    </div>
                  </div>
                ))}
              {importedEvents.length > 20 && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  ... und {importedEvents.length - 20} weitere Spiele
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hinweise</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>So funktioniert der Import:</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Spieltermine werden von der BFV-Website importiert</li>
            <li>Heimspiele werden automatisch dem A-Platz zugeordnet</li>
            <li>Bereits importierte Spiele werden nicht doppelt angelegt</li>
            <li>Änderungen auf BFV.de werden beim nächsten Import aktualisiert</li>
          </ul>
          <p className="pt-2">
            <strong>TSV Greding Vereins-ID:</strong> Sie finden die URL auf der 
            <a 
              href="https://www.bfv.de/vereine/tsv-greding" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1"
            >
              BFV-Vereinsseite
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

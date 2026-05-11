import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order, Campaign } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Download, ClipboardList, Mail, User, Calendar, Euro, Loader2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useState } from "react";

export default function OrdersPage() {
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null);

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setDeleteOrder(null);
      toast({
        title: "Bestellung gelöscht",
        description: "Die Bestellung wurde entfernt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(`/api/orders/export/${campaignId}`);
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bestellungen-${campaignId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export erfolgreich",
        description: "Die CSV-Datei wurde heruntergeladen.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Der Export konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const filteredOrders = orders?.filter((order) =>
    selectedCampaign === "all" ? true : order.campaignId === selectedCampaign
  ) || [];

  const getCampaignName = (campaignId: string) => {
    return campaigns?.find((c) => c.id === campaignId)?.name || "Unbekannt";
  };

  const totalAmount = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalItems = filteredOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bestellungen</h1>
          <p className="text-muted-foreground">
            Übersicht aller eingegangenen Sammelbestellungen
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-64" data-testid="select-campaign-filter">
              <SelectValue placeholder="Kampagne auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kampagnen</SelectItem>
              {campaigns?.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCampaign !== "all" && (
            <Button
              onClick={() => exportMutation.mutate(selectedCampaign)}
              disabled={exportMutation.isPending}
              data-testid="button-export"
            >
              {exportMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              CSV Export
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Bestellungen</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredOrders.length}</div>
            <p className="text-xs text-muted-foreground">
              {selectedCampaign === "all" ? "Gesamt" : "In dieser Kampagne"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Artikel</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-muted-foreground">Einzelne Artikel bestellt</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Gesamtwert</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAmount.toFixed(2)} €</div>
            <p className="text-xs text-muted-foreground">Bestellwert</p>
          </CardContent>
        </Card>
      </div>

      {ordersLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredOrders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Bestellübersicht</CardTitle>
            <CardDescription>
              Klicke auf eine Bestellung, um die Details zu sehen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {filteredOrders.map((order) => (
                <AccordionItem key={order.id} value={order.id}>
                  <AccordionTrigger className="hover:no-underline" data-testid={`order-${order.id}`}>
                    <div className="flex items-center gap-4 text-left w-full pr-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {order.firstName} {order.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {order.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(order.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{order.totalAmount.toFixed(2)} €</div>
                        <Badge variant="outline" className="text-xs">
                          {order.items.reduce((sum, item) => sum + item.quantity, 0)} Artikel
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produkt</TableHead>
                            <TableHead>Kategorie</TableHead>
                            <TableHead>Größe</TableHead>
                            <TableHead>Initialien</TableHead>
                            <TableHead className="text-center">Anzahl</TableHead>
                            <TableHead className="text-right">Preis</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{item.productName}</TableCell>
                              <TableCell>{item.category}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{item.size}</Badge>
                              </TableCell>
                              <TableCell>
                                {item.withInitials ? (
                                  <Badge variant="secondary">{item.initialsText}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                {item.totalPrice.toFixed(2)} €
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="flex justify-between items-center mt-4 pt-4 border-t gap-4">
                        <span className="text-sm text-muted-foreground">
                          Kampagne: {getCampaignName(order.campaignId)}
                        </span>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold">
                            Gesamt: {order.totalAmount.toFixed(2)} €
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteOrder(order)}
                            data-testid={`button-delete-order-${order.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Löschen
                          </Button>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Keine Bestellungen</h3>
            <p className="text-muted-foreground text-center">
              {selectedCampaign === "all"
                ? "Es sind noch keine Bestellungen eingegangen."
                : "Für diese Kampagne gibt es noch keine Bestellungen."}
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleteOrder !== null} onOpenChange={(open) => !open && setDeleteOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bestellung wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteOrder && (
                <>
                  Die Bestellung von <strong>{deleteOrder.firstName} {deleteOrder.lastName}</strong>{" "}
                  ({deleteOrder.email}) über <strong>{deleteOrder.totalAmount.toFixed(2)} €</strong>{" "}
                  wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrder && deleteMutation.mutate(deleteOrder.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-order"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

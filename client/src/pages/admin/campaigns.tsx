import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Campaign, InsertCampaign, Product } from "@shared/schema";
import { insertCampaignSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Pencil, Trash2, Calendar, Copy, Loader2, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isWithinInterval, parseISO, isPast } from "date-fns";
import { de } from "date-fns/locale";

export default function CampaignsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const form = useForm<InsertCampaign>({
    resolver: zodResolver(insertCampaignSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      active: true,
      productIds: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCampaign) => {
      return apiRequest("POST", "/api/campaigns", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Kampagne erstellt",
        description: "Die Kampagne wurde erfolgreich angelegt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Kampagne konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCampaign> }) => {
      return apiRequest("PATCH", `/api/campaigns/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsDialogOpen(false);
      setEditingCampaign(null);
      form.reset();
      toast({
        title: "Kampagne aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Kampagne konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setDeleteCampaign(null);
      toast({
        title: "Kampagne gelöscht",
        description: "Die Kampagne wurde gelöscht.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Kampagne konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/campaigns/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
  });

  const openEditDialog = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    form.reset({
      name: campaign.name,
      description: campaign.description,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      active: campaign.active,
      productIds: campaign.productIds,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingCampaign(null);
    form.reset({
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      active: true,
      productIds: [],
    });
    setIsDialogOpen(true);
  };

  const copyOrderLink = (campaignId: string) => {
    const link = `${window.location.origin}/order/${campaignId}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link kopiert",
      description: "Der Bestelllink wurde in die Zwischenablage kopiert.",
    });
  };

  const onSubmit = (data: InsertCampaign) => {
    if (editingCampaign) {
      updateMutation.mutate({ id: editingCampaign.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getCampaignStatus = (campaign: Campaign) => {
    const now = new Date();
    const start = parseISO(campaign.startDate);
    const end = parseISO(campaign.endDate);

    if (!campaign.active) {
      return { label: "Inaktiv", variant: "secondary" as const };
    }
    if (isPast(end)) {
      return { label: "Beendet", variant: "outline" as const };
    }
    if (isWithinInterval(now, { start, end })) {
      return { label: "Aktiv", variant: "default" as const };
    }
    return { label: "Geplant", variant: "secondary" as const };
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const activeProducts = products?.filter((p) => p.active) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kampagnen</h1>
          <p className="text-muted-foreground">
            Verwalte Sammelbestellungs-Kampagnen mit Start- und Enddatum
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} data-testid="button-add-campaign">
              <Plus className="h-4 w-4 mr-2" />
              Neue Kampagne
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCampaign ? "Kampagne bearbeiten" : "Neue Kampagne anlegen"}
              </DialogTitle>
              <DialogDescription>
                {editingCampaign
                  ? "Bearbeite die Kampagneninformationen"
                  : "Erstelle eine neue Sammelbestellung mit Zeitraum und Produkten"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kampagnenname *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="z.B. Sammelbestellung Sommer 2025"
                          {...field}
                          data-testid="input-campaign-name"
                        />
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
                      <FormLabel>Beschreibung *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Beschreibung für die Besteller..."
                          className="resize-none"
                          {...field}
                          data-testid="input-campaign-description"
                        />
                      </FormControl>
                      <FormDescription>
                        Diese Beschreibung wird den Bestellern angezeigt
                      </FormDescription>
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
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-campaign-start"
                          />
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
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-campaign-end"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="productIds"
                  render={() => (
                    <FormItem>
                      <FormLabel>Produkte auswählen</FormLabel>
                      <FormDescription>
                        Wähle die Produkte, die in dieser Kampagne verfügbar sein sollen
                      </FormDescription>
                      {activeProducts.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 mt-2 max-h-48 overflow-y-auto border rounded-md p-3">
                          {activeProducts.map((product) => (
                            <FormField
                              key={product.id}
                              control={form.control}
                              name="productIds"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(product.id)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        if (checked) {
                                          field.onChange([...current, product.id]);
                                        } else {
                                          field.onChange(current.filter((id) => id !== product.id));
                                        }
                                      }}
                                      data-testid={`checkbox-product-${product.id}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    {product.name}
                                    <span className="text-muted-foreground ml-1">
                                      ({product.basePrice.toFixed(2)}€)
                                    </span>
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground p-4 border rounded-md text-center">
                          Keine aktiven Produkte vorhanden. Bitte erstelle zuerst Produkte.
                        </div>
                      )}
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
                        <FormLabel>Kampagne aktiv</FormLabel>
                        <FormDescription>
                          Nur aktive Kampagnen sind für Besteller zugänglich
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-campaign-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={isPending} data-testid="button-save-campaign">
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingCampaign ? "Speichern" : "Anlegen"}
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
      ) : campaigns && campaigns.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign) => {
            const status = getCampaignStatus(campaign);
            const campaignProducts = products?.filter((p) =>
              campaign.productIds.includes(p.id)
            ) || [];

            return (
              <Card key={campaign.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {campaign.name}
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {format(parseISO(campaign.startDate), "dd. MMM yyyy", { locale: de })} -{" "}
                        {format(parseISO(campaign.endDate), "dd. MMM yyyy", { locale: de })}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{campaign.description}</p>

                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      {campaignProducts.length} Produkte
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {campaignProducts.slice(0, 4).map((product) => (
                        <Badge key={product.id} variant="outline" className="text-xs">
                          {product.name}
                        </Badge>
                      ))}
                      {campaignProducts.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{campaignProducts.length - 4} weitere
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Switch
                      checked={campaign.active}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ id: campaign.id, active: checked })
                      }
                      data-testid={`switch-active-${campaign.id}`}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyOrderLink(campaign.id)}
                      title="Bestelllink kopieren"
                      data-testid={`button-copy-${campaign.id}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(campaign)}
                      data-testid={`button-edit-${campaign.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteCampaign(campaign)}
                      data-testid={`button-delete-${campaign.id}`}
                    >
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
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Keine Kampagnen vorhanden</h3>
            <p className="text-muted-foreground text-center mb-4">
              Erstelle deine erste Kampagne für eine Sammelbestellung.
            </p>
            <Button onClick={openCreateDialog} data-testid="button-add-campaign-empty">
              <Plus className="h-4 w-4 mr-2" />
              Neue Kampagne
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteCampaign} onOpenChange={() => setDeleteCampaign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampagne löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Kampagne "{deleteCampaign?.name}" wird unwiderruflich gelöscht.
              Bestellungen bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCampaign && deleteMutation.mutate(deleteCampaign.id)}
              data-testid="button-confirm-delete"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

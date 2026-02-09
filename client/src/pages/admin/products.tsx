import type { ChangeEvent } from "react";
import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Product, InsertProduct } from "@shared/schema";
import { insertProductSchema, AVAILABLE_SIZES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Package, Euro, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ImageUploadResult {
  thumbnail: string;
  medium: string;
  original: string;
}

function ImageUploader({
  value,
  onChange,
  additionalImages,
  onAdditionalChange,
}: {
  value: string;
  onChange: (url: string) => void;
  additionalImages: string[];
  onAdditionalChange: (urls: string[]) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingAdditional, setIsUploadingAdditional] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const additionalInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadImage = useCallback(async (file: File): Promise<ImageUploadResult | null> => {
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Upload fehlgeschlagen");
      }

      return await response.json();
    } catch (error) {
      toast({
        title: "Upload-Fehler",
        description: (error as Error).message,
        variant: "destructive",
      });
      return null;
    }
  }, [toast]);

  const handleMainUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadImage(file);
    if (result) {
      onChange(result.medium);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAdditionalUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingAdditional(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const result = await uploadImage(file);
      if (result) {
        newUrls.push(result.medium);
      }
    }

    if (newUrls.length > 0) {
      onAdditionalChange([...additionalImages, ...newUrls]);
    }
    setIsUploadingAdditional(false);
    if (additionalInputRef.current) additionalInputRef.current.value = "";
  };

  const removeAdditionalImage = (index: number) => {
    onAdditionalChange(additionalImages.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Hauptbild
        </label>
        <div className="mt-2">
          {value ? (
            <div className="relative w-full max-w-xs rounded-md overflow-visible border bg-muted">
              <img
                src={value}
                alt="Produktbild"
                className="w-full aspect-square object-contain p-2"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-1 right-1"
                onClick={() => onChange("")}
                data-testid="button-remove-main-image"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              className="relative w-full max-w-xs aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-main-image"
            >
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground text-center px-4">
                    Klicken zum Hochladen (JPG, PNG, WebP, HEIC)
                  </span>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/tiff,image/bmp"
            className="hidden"
            onChange={handleMainUpload}
            data-testid="input-file-main-image"
          />
          {!value && (
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              data-testid="button-upload-main-image"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Bild hochladen
            </Button>
          )}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium leading-none">
          Weitere Bilder
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {additionalImages.map((url, index) => (
            <div key={index} className="relative w-20 h-20 rounded-md overflow-visible border bg-muted">
              <img
                src={url}
                alt={`Bild ${index + 1}`}
                className="w-full h-full object-contain p-1"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -top-1.5 -right-1.5 h-5 w-5"
                onClick={() => removeAdditionalImage(index)}
                data-testid={`button-remove-additional-${index}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div
            className="w-20 h-20 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer bg-muted/50"
            onClick={() => additionalInputRef.current?.click()}
            data-testid="dropzone-additional-images"
          >
            {isUploadingAdditional ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Plus className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
        <input
          ref={additionalInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/tiff,image/bmp"
          multiple
          className="hidden"
          onChange={handleAdditionalUpload}
          data-testid="input-file-additional-images"
        />
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const form = useForm<InsertProduct>({
    resolver: zodResolver(insertProductSchema),
    defaultValues: {
      name: "",
      category: "",
      basePrice: 0,
      imageUrl: "",
      additionalImages: [],
      active: true,
      shortDescription: "",
      longDescription: "",
      brand: "",
      season: "",
      availableSizes: ["S", "M", "L", "XL", "XXL"],
      initialsEnabled: false,
      initialsPrice: 0,
      initialsLabel: "Initialien",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertProduct) => {
      return apiRequest("POST", "/api/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Produkt erstellt",
        description: "Das Produkt wurde erfolgreich angelegt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Produkt konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertProduct> }) => {
      return apiRequest("PATCH", `/api/products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      toast({
        title: "Produkt aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Produkt konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDeleteProduct(null);
      toast({
        title: "Produkt archiviert",
        description: "Das Produkt wurde archiviert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Produkt konnte nicht archiviert werden.",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/products/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      category: product.category,
      basePrice: product.basePrice,
      imageUrl: product.imageUrl,
      additionalImages: product.additionalImages,
      active: product.active,
      shortDescription: product.shortDescription || "",
      longDescription: product.longDescription || "",
      brand: product.brand || "",
      season: product.season || "",
      availableSizes: product.availableSizes,
      initialsEnabled: product.initialsEnabled,
      initialsPrice: product.initialsPrice,
      initialsLabel: product.initialsLabel,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      category: "",
      basePrice: 0,
      imageUrl: "",
      additionalImages: [],
      active: true,
      shortDescription: "",
      longDescription: "",
      brand: "",
      season: "",
      availableSizes: ["S", "M", "L", "XL", "XXL"],
      initialsEnabled: false,
      initialsPrice: 0,
      initialsLabel: "Initialien",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: InsertProduct) => {
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produkte</h1>
          <p className="text-muted-foreground">
            Verwalte alle Produkte für Sammelbestellungen
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} data-testid="button-add-product">
              <Plus className="h-4 w-4 mr-2" />
              Neues Produkt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? "Produkt bearbeiten" : "Neues Produkt anlegen"}
              </DialogTitle>
              <DialogDescription>
                {editingProduct
                  ? "Bearbeite die Produktinformationen"
                  : "Fülle die Felder aus, um ein neues Produkt anzulegen"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Produktname *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="z.B. T-Shirt grün"
                            {...field}
                            data-testid="input-product-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kategorie *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="z.B. T-Shirt, Pullover"
                            {...field}
                            data-testid="input-product-category"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="basePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Basispreis (€) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-product-price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Marke</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="z.B. JAKO"
                            {...field}
                            data-testid="input-product-brand"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <ImageUploader
                  value={form.watch("imageUrl")}
                  onChange={(url) => form.setValue("imageUrl", url)}
                  additionalImages={form.watch("additionalImages") || []}
                  onAdditionalChange={(urls) => form.setValue("additionalImages", urls)}
                />

                <FormField
                  control={form.control}
                  name="shortDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kurzbeschreibung</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="z.B. Trainingsshirt JAKO, atmungsaktiv"
                          {...field}
                          data-testid="input-product-short-desc"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="longDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ausführliche Beschreibung</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Weitere Details zum Produkt..."
                          className="resize-none"
                          {...field}
                          data-testid="input-product-long-desc"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="season"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Saison</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="z.B. Sommer 2025, Winter 25/26"
                          {...field}
                          data-testid="input-product-season"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="availableSizes"
                  render={() => (
                    <FormItem>
                      <FormLabel>Verfügbare Größen *</FormLabel>
                      <div className="flex flex-wrap gap-3 mt-2">
                        {AVAILABLE_SIZES.map((size) => (
                          <FormField
                            key={size}
                            control={form.control}
                            name="availableSizes"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(size)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, size]);
                                      } else {
                                        field.onChange(current.filter((s) => s !== size));
                                      }
                                    }}
                                    data-testid={`checkbox-size-${size}`}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer">
                                  {size}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4 rounded-md border p-4">
                  <FormField
                    control={form.control}
                    name="initialsEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <FormLabel>Initialien/Beflockung möglich</FormLabel>
                          <FormDescription>
                            Besteller können optionalen Aufdruck hinzufügen
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-initials-enabled"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("initialsEnabled") && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <FormField
                        control={form.control}
                        name="initialsPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aufpreis (€)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                data-testid="input-initials-price"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="initialsLabel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bezeichnung</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="z.B. Initialienaufdruck"
                                {...field}
                                data-testid="input-initials-label"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-4">
                      <div>
                        <FormLabel>Produkt aktiv</FormLabel>
                        <FormDescription>
                          Nur aktive Produkte werden im Bestellformular angezeigt
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-product-active"
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
                  <Button type="submit" disabled={isPending} data-testid="button-save-product">
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingProduct ? "Speichern" : "Anlegen"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="aspect-square w-full rounded-md mb-4" />
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : products && products.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="overflow-visible">
              <div className="aspect-square relative bg-muted rounded-t-md overflow-hidden">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-contain p-4"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                    data-testid={`img-product-${product.id}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge variant={product.active ? "default" : "secondary"}>
                    {product.active ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                    <CardDescription>
                      {product.category}
                      {product.brand && ` • ${product.brand}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Euro className="h-4 w-4" />
                  {product.basePrice.toFixed(2)}
                  {product.initialsEnabled && (
                    <span className="text-sm font-normal text-muted-foreground">
                      + {product.initialsPrice.toFixed(2)} für {product.initialsLabel}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {product.availableSizes.map((size) => (
                    <Badge key={size} variant="outline" className="text-xs">
                      {size}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Switch
                      checked={product.active}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ id: product.id, active: checked })
                      }
                      data-testid={`switch-active-${product.id}`}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(product)}
                      data-testid={`button-edit-${product.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteProduct(product)}
                      data-testid={`button-delete-${product.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Keine Produkte vorhanden</h3>
            <p className="text-muted-foreground text-center mb-4">
              Erstelle dein erstes Produkt, um mit Sammelbestellungen zu starten.
            </p>
            <Button onClick={openCreateDialog} data-testid="button-add-product-empty">
              <Plus className="h-4 w-4 mr-2" />
              Neues Produkt
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteProduct} onOpenChange={() => setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produkt archivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Produkt "{deleteProduct?.name}" wird archiviert und nicht mehr in
              Bestellungen angezeigt. Du kannst es später wiederherstellen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProduct && deleteMutation.mutate(deleteProduct.id)}
              data-testid="button-confirm-delete"
            >
              Archivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

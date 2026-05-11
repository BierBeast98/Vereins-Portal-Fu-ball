import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Campaign, Product, OrderItem, Size } from "@shared/schema";
import { AVAILABLE_SIZES } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart,
  Package,
  Calendar,
  Check,
  Minus,
  Plus,
  Loader2,
  AlertCircle,
  ImageIcon,
  X,
  Home,
  Lock,
} from "lucide-react";
import { format, parseISO, isPast, isFuture, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";

interface CartItem {
  productId: string;
  productName: string;
  category: string;
  size: Size;
  quantity: number;
  withInitials: boolean;
  initialsText: string;
  unitPrice: number;
  initialsPrice: number;
}

const customerSchema = z.object({
  email: z.string().email("Bitte gib eine gültige E-Mail-Adresse ein"),
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
});

type CustomerData = z.infer<typeof customerSchema>;

export default function OrderFormPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderComplete, setOrderComplete] = useState(false);
  // Wenn die Kampagne passwortgeschützt ist, speichern wir das eingegebene Passwort
  // für die aktuelle Browser-Session, damit ein Reload nicht zur Neueingabe zwingt.
  const passwordStorageKey = campaignId ? `campaign-password:${campaignId}` : null;
  const [campaignPassword, setCampaignPassword] = useState<string | null>(() => {
    if (!passwordStorageKey) return null;
    try {
      return sessionStorage.getItem(passwordStorageKey);
    } catch {
      return null;
    }
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const { data: campaign, isLoading: campaignLoading, error: campaignError } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const form = useForm<CustomerData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: CustomerData) => {
      const orderItems: OrderItem[] = cart.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        category: item.category,
        size: item.size,
        quantity: item.quantity,
        withInitials: item.withInitials,
        initialsText: item.initialsText || undefined,
        unitPrice: item.unitPrice,
        initialsPrice: item.initialsPrice,
        totalPrice: (item.unitPrice + (item.withInitials ? item.initialsPrice : 0)) * item.quantity,
      }));

      return apiRequest("POST", "/api/orders", {
        campaignId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        items: orderItems,
        ...(campaignPassword ? { campaignPassword } : {}),
      });
    },
    onSuccess: () => {
      setOrderComplete(true);
      setCart([]);
      form.reset();
    },
    onError: (err: Error) => {
      // Falls das Bestell-Passwort serverseitig abgelehnt wurde (z.B. Admin hat es geändert),
      // löschen wir das gespeicherte Passwort und zwingen den Besteller zur Neueingabe.
      if (err.message.startsWith("401") && campaign?.hasPassword) {
        if (passwordStorageKey) {
          try {
            sessionStorage.removeItem(passwordStorageKey);
          } catch {
            // ignore
          }
        }
        setCampaignPassword(null);
        toast({
          title: "Passwort abgelaufen",
          description: "Das Bestell-Passwort wurde geändert. Bitte gib es erneut ein.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht abgeschickt werden. Bitte versuche es erneut.",
        variant: "destructive",
      });
    },
  });

  const campaignProducts = products?.filter((p) =>
    campaign?.productIds.includes(p.id) && p.active
  ) || [];

  const addToCart = (
    product: Product,
    size: Size,
    withInitials: boolean,
    initialsText: string
  ) => {
    const existingIndex = cart.findIndex(
      (item) =>
        item.productId === product.id &&
        item.size === size &&
        item.withInitials === withInitials &&
        item.initialsText === initialsText
    );

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          category: product.category,
          size,
          quantity: 1,
          withInitials,
          initialsText,
          unitPrice: product.basePrice,
          initialsPrice: product.initialsPrice,
        },
      ]);
    }

    toast({
      title: "Hinzugefügt",
      description: `${product.name} (${size}) wurde zum Warenkorb hinzugefügt.`,
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const cartTotal = cart.reduce((sum, item) => {
    const itemTotal = (item.unitPrice + (item.withInitials ? item.initialsPrice : 0)) * item.quantity;
    return sum + itemTotal;
  }, 0);

  const onSubmit = (data: CustomerData) => {
    if (cart.length === 0) {
      toast({
        title: "Warenkorb leer",
        description: "Bitte füge mindestens einen Artikel hinzu.",
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate(data);
  };

  // Check campaign status
  const getCampaignStatus = () => {
    if (!campaign) return null;
    const now = new Date();
    const start = parseISO(campaign.startDate);
    const end = parseISO(campaign.endDate);

    if (!campaign.active) {
      return { type: "inactive", message: "Diese Kampagne ist derzeit nicht aktiv." };
    }
    if (isPast(end)) {
      return { type: "ended", message: "Diese Sammelbestellung ist bereits beendet." };
    }
    if (isFuture(start)) {
      return {
        type: "upcoming",
        message: `Diese Sammelbestellung startet am ${format(start, "dd. MMMM yyyy", { locale: de })}.`,
      };
    }
    if (isWithinInterval(now, { start, end })) {
      return { type: "active", message: null };
    }
    return null;
  };

  const status = getCampaignStatus();

  if (campaignLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto p-4 md:p-8">
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (campaignError || !campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Kampagne nicht gefunden</h2>
            <p className="text-muted-foreground text-center">
              Die angeforderte Sammelbestellung existiert nicht oder wurde gelöscht.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status && status.type !== "active") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">{campaign.name}</h2>
            <p className="text-muted-foreground text-center">{status.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Passwort-Gate: Wenn die Kampagne passwortgeschützt ist und noch kein gültiges
  // Passwort in der Session liegt, zeigen wir eine Eingabemaske statt des Formulars.
  if (campaign.hasPassword && !campaignPassword) {
    const verifyPassword = async () => {
      if (!passwordInput || !campaignId) return;
      setVerifyingPassword(true);
      setPasswordError(null);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/verify-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: passwordInput }),
          credentials: "include",
        });
        if (res.ok) {
          setCampaignPassword(passwordInput);
          if (passwordStorageKey) {
            try {
              sessionStorage.setItem(passwordStorageKey, passwordInput);
            } catch {
              // sessionStorage kann blockiert sein (Private Mode) — egal, das Passwort lebt dann nur im State
            }
          }
          setPasswordInput("");
        } else if (res.status === 401) {
          setPasswordError("Das Passwort ist leider falsch.");
        } else if (res.status === 429) {
          setPasswordError("Zu viele Versuche. Bitte warte 15 Minuten und versuche es erneut.");
        } else {
          setPasswordError("Die Prüfung ist fehlgeschlagen. Bitte versuche es erneut.");
        }
      } catch {
        setPasswordError("Netzwerkfehler. Bitte versuche es erneut.");
      } finally {
        setVerifyingPassword(false);
      }
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle className="text-center">{campaign.name}</CardTitle>
            <CardDescription className="text-center">
              Diese Sammelbestellung ist passwortgeschützt. Bitte gib das Passwort ein,
              das du vom Verein erhalten hast.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyPassword();
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="campaign-password">Passwort</Label>
                <Input
                  id="campaign-password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Passwort eingeben"
                  disabled={verifyingPassword}
                  autoFocus
                  data-testid="input-gate-password"
                />
                {passwordError && (
                  <p className="text-sm text-destructive mt-2" data-testid="text-gate-error">
                    {passwordError}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyingPassword || !passwordInput}
                data-testid="button-gate-submit"
              >
                {verifyingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Prüfe...
                  </>
                ) : (
                  "Weiter zur Bestellung"
                )}
              </Button>
              <div className="text-center">
                <Link href="/" className="text-sm text-muted-foreground hover:underline">
                  Zurück zur Startseite
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (orderComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Bestellung abgeschickt!</h2>
            <p className="text-muted-foreground text-center mb-6">
              Vielen Dank für deine Bestellung. Du erhältst eine Bestätigung per E-Mail.
            </p>
            <Button onClick={() => setOrderComplete(false)} data-testid="button-new-order">
              Neue Bestellung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{campaign.name}</h1>
          <p className="text-primary-foreground/80">{campaign.description}</p>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <Calendar className="h-4 w-4" />
            <span>
              Bestellzeitraum:{" "}
              {format(parseISO(campaign.startDate), "dd.MM.yyyy", { locale: de })} -{" "}
              {format(parseISO(campaign.endDate), "dd.MM.yyyy", { locale: de })}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Deine Daten</h2>
              <Card>
                <CardContent className="pt-6">
                  <Form {...form}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>E-Mail-Adresse *</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="deine@email.de"
                                {...field}
                                data-testid="input-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vorname *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Max"
                                {...field}
                                data-testid="input-firstname"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nachname *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Mustermann"
                                {...field}
                                data-testid="input-lastname"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Form>
                </CardContent>
              </Card>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">
                Produkte ({campaignProducts.length})
              </h2>
              <div className="space-y-4">
                {campaignProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={addToCart}
                  />
                ))}
                {campaignProducts.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center py-12">
                      <Package className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        Keine Produkte in dieser Kampagne verfügbar.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Warenkorb
                  </CardTitle>
                  <CardDescription>
                    {cart.length === 0
                      ? "Noch keine Artikel ausgewählt"
                      : `${cart.reduce((sum, item) => sum + item.quantity, 0)} Artikel`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cart.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Wähle Produkte aus, um sie hier zu sehen.
                    </p>
                  ) : (
                    cart.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between gap-2 p-3 bg-muted/50 rounded-md"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            Größe: {item.size}
                            {item.withInitials && ` • ${item.initialsText}`}
                          </p>
                          <p className="text-sm font-medium mt-1">
                            {(
                              (item.unitPrice + (item.withInitials ? item.initialsPrice : 0)) *
                              item.quantity
                            ).toFixed(2)}{" "}
                            €
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(index, -1)}
                            data-testid={`button-decrease-${index}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm">{item.quantity}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(index, 1)}
                            data-testid={`button-increase-${index}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeFromCart(index)}
                            data-testid={`button-remove-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
                {cart.length > 0 && (
                  <CardFooter className="flex-col gap-4">
                    <div className="flex justify-between w-full text-lg font-semibold">
                      <span>Gesamt</span>
                      <span>{cartTotal.toFixed(2)} €</span>
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={form.handleSubmit(onSubmit)}
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-order"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Bestellung abschicken
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </div>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t">
          <div className="flex items-center justify-center gap-4 text-muted-foreground">
            <Link href="/" className="text-sm hover:underline flex items-center gap-1" data-testid="link-home">
              <Home className="h-4 w-4" />
              Startseite
            </Link>
            <span className="text-muted-foreground/50">|</span>
            <Link href="/admin/products" className="text-sm hover:underline flex items-center gap-1" data-testid="link-admin">
              <Lock className="h-4 w-4" />
              Admin-Bereich
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  onAddToCart: (
    product: Product,
    size: Size,
    withInitials: boolean,
    initialsText: string
  ) => void;
}

function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [withInitials, setWithInitials] = useState<boolean | null>(null);
  const [initialsText, setInitialsText] = useState("");

  const canAdd =
    selectedSize &&
    (product.initialsEnabled ? withInitials !== null : true) &&
    (!withInitials || initialsText.trim());

  const handleAdd = () => {
    if (canAdd && selectedSize) {
      onAddToCart(product, selectedSize, withInitials || false, initialsText.trim());
      setSelectedSize(null);
      setWithInitials(null);
      setInitialsText("");
    }
  };

  const totalPrice = product.basePrice + (withInitials ? product.initialsPrice : 0);

  return (
    <Card data-testid={`product-${product.id}`}>
      <div className="md:flex">
        <div className="md:w-48 md:h-48 aspect-square bg-muted flex items-center justify-center flex-shrink-0">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-4"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-semibold text-lg">{product.name}</h3>
              <p className="text-sm text-muted-foreground">
                {product.category}
                {product.brand && ` • ${product.brand}`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-lg">{totalPrice.toFixed(2)} €</p>
              {product.initialsEnabled && (
                <p className="text-xs text-muted-foreground">
                  + {product.initialsPrice.toFixed(2)}€ für {product.initialsLabel}
                </p>
              )}
            </div>
          </div>

          {product.shortDescription && (
            <p className="text-sm text-muted-foreground mb-4">{product.shortDescription}</p>
          )}

          <div className="space-y-4">
            {product.initialsEnabled && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Beflockung</Label>
                <RadioGroup
                  value={withInitials === null ? undefined : withInitials ? "yes" : "no"}
                  onValueChange={(val) => setWithInitials(val === "yes")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`no-initials-${product.id}`} />
                    <Label
                      htmlFor={`no-initials-${product.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      Ohne {product.initialsLabel}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`yes-initials-${product.id}`} />
                    <Label
                      htmlFor={`yes-initials-${product.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      Mit {product.initialsLabel} (+{product.initialsPrice.toFixed(2)}€)
                    </Label>
                  </div>
                </RadioGroup>
                {withInitials && (
                  <Input
                    placeholder="Text für Beflockung eingeben..."
                    value={initialsText}
                    onChange={(e) => setInitialsText(e.target.value)}
                    className="mt-2"
                    data-testid={`input-initials-${product.id}`}
                  />
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Größe auswählen</Label>
              <div className="flex flex-wrap gap-2">
                {product.availableSizes.map((size) => (
                  <Button
                    key={size}
                    variant={selectedSize === size ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSize(size)}
                    data-testid={`button-size-${product.id}-${size}`}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleAdd}
              disabled={!canAdd}
              className="w-full md:w-auto"
              data-testid={`button-add-${product.id}`}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Zum Warenkorb hinzufügen
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, ShieldCheck } from "lucide-react";
import { allowedDestination, portalAuthQuery, portalJson, usePortalAuth } from "@/lib/portal-auth";
import type { AuthState } from "@shared/permissions";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: auth, isLoading, error: authError, refetch } = usePortalAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [registerMode, setRegisterMode] = useState(false);
  const [registrationNotice, setRegistrationNotice] = useState("");
  const next = new URLSearchParams(window.location.search).get("next");
  const setup = Boolean(auth?.setupRequired);
  const register = registerMode && !setup;

  useEffect(() => {
    if (auth?.authenticated) setLocation(allowedDestination(auth, next));
  }, [auth, next, setLocation]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (register) {
        await portalJson("/api/auth/register", "POST", { name: name.trim(), email: email.trim(), password });
        setPassword(""); setName(""); setRegisterMode(false);
        setRegistrationNotice("Dein Zugang wurde beantragt und wartet auf Freigabe. Die zuständige Person im Verein prüft dein Konto und vergibt deine Rechte. Du kannst dich erst nach der Freigabe anmelden.");
        return;
      }
      await portalJson(setup ? "/api/auth/setup" : "/api/auth/login", "POST", setup ? { name, email, password, bootstrapPassword } : { email, password });
      // Discard all data from any previous personal session before loading this account.
      queryClient.clear();
      const current = await queryClient.fetchQuery<AuthState>(portalAuthQuery);
      if (!current.authenticated) throw new Error("Die Anmeldung konnte nicht bestätigt werden. Bitte erneut anmelden.");
      setPassword(""); setBootstrapPassword("");
      setLocation(allowedDestination(current, next));
    },
  });

  return <div className="flex min-h-screen items-center justify-center bg-background p-4"><Card className="w-full max-w-md">
    <CardHeader className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">{setup || register ? <ShieldCheck className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-primary" />}</div><CardTitle className="text-2xl">{setup ? "Erstes persönliches Konto einrichten" : register ? "Persönlichen Zugang beantragen" : "Im Vereinsportal anmelden"}</CardTitle><CardDescription>{setup ? "Einmalige Einrichtung des ersten Kontos mit vollständigem Zugriff." : register ? "Registriere dich mit deinem Namen, deiner E-Mail-Adresse und einem eigenen Passwort. Dein Zugang wird anschließend vom Verein freigegeben." : "Melde dich mit deiner E-Mail-Adresse und deinem persönlichen Passwort an."}</CardDescription></CardHeader>
    <CardContent>{registrationNotice && <p role="status" className="mb-4 rounded-lg border bg-primary/5 p-3 text-sm">{registrationNotice}</p>}{isLoading ? <p role="status" className="text-sm text-muted-foreground">Zugang wird geprüft …</p> : authError ? <div role="alert" className="space-y-3 text-sm"><p>Der Anmeldestatus konnte nicht geladen werden.</p><Button variant="outline" onClick={() => void refetch()}>Erneut versuchen</Button></div> : <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="space-y-4">
      {setup && <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Für die Ersteinrichtung wird das bisherige Admin-Passwort benötigt. Danach können Mitglieder ihren Zugang selbst beantragen.</div>}
      {(setup || register) && <div className="space-y-2"><Label htmlFor="setup-name">Dein Name</Label><Input id="setup-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} required /></div>}
      <div className="space-y-2"><Label htmlFor="login-email">E-Mail-Adresse</Label><Input id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required data-testid="input-admin-email" /></div>
      <div className="space-y-2"><Label htmlFor="login-password">{setup || register ? "Dein neues persönliches Passwort" : "Passwort"}</Label><Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={setup || register ? 12 : undefined} maxLength={200} autoComplete={setup || register ? "new-password" : "current-password"} required data-testid="input-admin-password" />{(setup || register) && <p className="text-xs text-muted-foreground">12 bis 200 Zeichen.</p>}</div>
      {setup && <div className="space-y-2"><Label htmlFor="setup-bootstrap">Bisheriges Admin-Passwort</Label><Input id="setup-bootstrap" type="password" autoComplete="off" value={bootstrapPassword} onChange={(event) => setBootstrapPassword(event.target.value)} maxLength={200} required /></div>}
      {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
      <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-admin-login">{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{setup ? "Persönliches Konto einrichten" : register ? "Zugang beantragen" : "Anmelden"}</Button>
      {!setup && <div className="space-y-2 text-center"><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => { setRegisterMode(!register); setPassword(""); setRegistrationNotice(""); mutation.reset(); }}>{register ? "Zur Anmeldung" : "Noch kein Konto? Zugang beantragen"}</Button>{register && <p className="text-xs text-muted-foreground">Dein Antrag gewährt noch keinen Zugriff auf interne Bereiche. Die zuständige Person legt deine Rechte bei der Freigabe fest.</p>}</div>}
    </form>}<Link href="/" className="mt-5 block text-center text-sm text-primary underline">Zurück zum Vereinsportal</Link></CardContent>
  </Card></div>;
}

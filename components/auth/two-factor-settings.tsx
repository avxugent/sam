"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  CheckCircle2,
  Info,
  RefreshCw,
} from "lucide-react";

type Props = {
  provider: string;
  totpEnabled: boolean;
};

type SetupState = "idle" | "scanning" | "verifying" | "done";

export function TwoFactorSettings({ provider, totpEnabled: initialEnabled }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [enabled, setEnabled] = useState(initialEnabled);
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [enableCode, setEnableCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showManualKey, setShowManualKey] = useState(false);

  // Not applicable to SSO accounts
  if (provider !== "credentials") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 text-muted-foreground">
            <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              Two-factor authentication is managed by your organisation&apos;s
              Microsoft identity provider. It cannot be configured here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function handleStartSetup() {
    setLoading(true);
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const data = await res.json();
    setQrCode(data.qrCodeDataUrl);
    setSecret(data.secret);
    setEnableCode("");
    setSetupState("scanning");
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = enableCode.replace(/\s/g, "");
    if (trimmed.length !== 6) return;

    setLoading(true);
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    });
    setLoading(false);

    const data = await res.json();
    if (!res.ok) {
      toast({ title: t("twoFactorInvalid"), description: data.error, variant: "destructive" });
      setEnableCode("");
      return;
    }

    setEnabled(true);
    setSetupState("done");
    toast({ title: t("twoFactorEnabled"), description: t("twoFactorEnabledDescription") });
    router.refresh();
  }

  async function handleDisable() {
    const trimmed = disableCode.replace(/\s/g, "");
    if (trimmed.length !== 6) return;

    setLoading(true);
    const res = await fetch("/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    });
    setLoading(false);

    const data = await res.json();
    if (!res.ok) {
      toast({ title: t("twoFactorInvalid"), description: data.error, variant: "destructive" });
      setDisableCode("");
      return;
    }

    setEnabled(false);
    setSetupState("idle");
    setDisableCode("");
    toast({ title: t("twoFactorDisabled") });
    router.refresh();
  }

  // ── Enabled state ────────────────────────────────────────────────────────
  if (enabled && setupState !== "done") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              Two-Factor Authentication
            </CardTitle>
            <Badge className="bg-green-100 text-green-800 border-green-200">
              Enabled
            </Badge>
          </div>
          <CardDescription>
            Your account is secured with a TOTP authenticator app.
            Each login requires a 6-digit code from your app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />

          {/* Reconfigure */}
          <div>
            <p className="text-sm font-medium mb-1">Reconfigure authenticator</p>
            <p className="text-xs text-muted-foreground mb-3">
              Use this if you got a new phone or need to re-scan the QR code.
              Your current 2FA will remain active until you verify the new setup.
            </p>
            <Button variant="outline" size="sm" onClick={handleStartSetup} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Set up a new authenticator
            </Button>
          </div>

          <Separator />

          {/* Disable */}
          <div>
            <p className="text-sm font-medium mb-1">Disable 2FA</p>
            <p className="text-xs text-muted-foreground mb-3">
              Enter your current 6-digit code to confirm you want to disable
              two-factor authentication.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <ShieldOff className="h-4 w-4 mr-1.5" />
                  Disable 2FA
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will make your account less secure. Enter your current
                    6-digit code to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="px-6 pb-2">
                  <Label htmlFor="disable-code">Current code</Label>
                  <Input
                    id="disable-code"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="font-mono text-center tracking-widest mt-1.5"
                    inputMode="numeric"
                    autoFocus
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDisableCode("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDisable}
                    disabled={loading || disableCode.length !== 6}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    {t("twoFactorDisable")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Done / just enabled ──────────────────────────────────────────────────
  if (setupState === "done") {
    return (
      <Card className="border-green-200">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h3 className="text-lg font-semibold">2FA is now active</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Every time you sign in with your password, you will be asked
              for a 6-digit code from your authenticator app.
            </p>
            <Button onClick={() => setSetupState("idle")} variant="outline" className="mt-2">
              Back to settings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Scanning / setup flow ────────────────────────────────────────────────
  if (setupState === "scanning") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("twoFactorSetupTitle")}</CardTitle>
          <CardDescription>
            {t("twoFactorSetupSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* QR code */}
          <div className="flex justify-center">
            {qrCode && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCode}
                alt="TOTP QR code"
                className="rounded-lg border"
                width={220}
                height={220}
              />
            )}
          </div>

          {/* Manual entry toggle */}
          <div className="text-center">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setShowManualKey((v) => !v)}
            >
              {showManualKey ? t("hideManualKey") : t("cantScanKey")}
            </button>
            {showManualKey && (
              <div className="mt-2 p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Manual entry key:</p>
                <code className="text-sm font-mono select-all break-all">{secret}</code>
                <p className="text-xs text-muted-foreground mt-1">
                  Type: Time-based · Period: 30s · Digits: 6
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Code verification */}
          <form onSubmit={handleEnable} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="enable-code">
                Enter the code shown in your app
              </Label>
              <Input
                id="enable-code"
                value={enableCode}
                onChange={(e) =>
                  setEnableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="font-mono text-center tracking-widest text-xl h-12"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSetupState("idle")}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || enableCode.length !== 6}
                className="flex-1"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("twoFactorSetupConfirm")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── Not yet enabled ──────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
            Two-Factor Authentication
          </CardTitle>
          <Badge variant="outline" className="text-muted-foreground">
            Not enabled
          </Badge>
        </div>
        <CardDescription>
          Add an extra layer of security. After entering your password,
          you will be asked for a 6-digit code from an authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleStartSetup} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          Enable 2FA
        </Button>
      </CardContent>
    </Card>
  );
}

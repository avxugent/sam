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
import { confirmTotpSetup, normalizeTotpCode, requestTotpSetup } from "@/lib/two-factor/enrollment-client";

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
            <p className="text-sm">{t("twoFactorSsoManaged")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function handleStartSetup() {
    setLoading(true);
    const data = await requestTotpSetup();
    setLoading(false);
    if (!data.ok) {
      toast({ title: tCommon("error"), description: data.error, variant: "destructive" });
      return;
    }
    setQrCode(data.qrCodeDataUrl);
    setSecret(data.secret);
    setEnableCode("");
    setSetupState("scanning");
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    if (normalizeTotpCode(enableCode).length !== 6) return;

    setLoading(true);
    const result = await confirmTotpSetup(enableCode);
    setLoading(false);

    if (!result.ok) {
      toast({ title: t("twoFactorInvalid"), description: result.error, variant: "destructive" });
      setEnableCode("");
      return;
    }

    setEnabled(true);
    setSetupState("done");
    toast({ title: t("twoFactorEnabled"), description: t("twoFactorEnabledDescription") });
    router.refresh();
  }

  async function handleDisable() {
    const trimmed = normalizeTotpCode(disableCode);
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
              {t("twoFactorSettingsTitle")}
            </CardTitle>
            <Badge className="bg-green-100 text-green-800 border-green-200">
              {t("twoFactorBadgeEnabled")}
            </Badge>
          </div>
          <CardDescription>
            {t("twoFactorActiveDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />

          {/* Reconfigure */}
          <div>
            <p className="text-sm font-medium mb-1">{t("twoFactorReconfigureTitle")}</p>
            <p className="text-xs text-muted-foreground mb-3">{t("twoFactorReconfigureHelp")}</p>
            <Button variant="outline" size="sm" onClick={handleStartSetup} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              {t("twoFactorReconfigureButton")}
            </Button>
          </div>

          <Separator />

          {/* Disable */}
          <div>
            <p className="text-sm font-medium mb-1">{t("twoFactorDisableTitle")}</p>
            <p className="text-xs text-muted-foreground mb-3">{t("twoFactorDisableHelp")}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <ShieldOff className="h-4 w-4 mr-1.5" />
                  {t("twoFactorDisableTitle")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("twoFactorDisableConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("twoFactorDisableConfirmDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="px-6 pb-2">
                  <Label htmlFor="disable-code">{t("twoFactorCurrentCode")}</Label>
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
                  <AlertDialogCancel onClick={() => setDisableCode("")}>{tCommon("cancel")}</AlertDialogCancel>
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
            <h3 className="text-lg font-semibold">{t("twoFactorNowActiveTitle")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs">{t("twoFactorNowActiveDescription")}</p>
            <Button onClick={() => setSetupState("idle")} variant="outline" className="mt-2">
              {t("twoFactorBackToSettings")}
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
                alt={t("twoFactorQrAlt")}
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
                <p className="text-xs text-muted-foreground mb-1">{t("twoFactorManualKey")}</p>
                <code className="text-sm font-mono select-all break-all">{secret}</code>
                <p className="text-xs text-muted-foreground mt-1">{t("twoFactorManualKeyParams")}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Code verification */}
          <form onSubmit={handleEnable} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="enable-code">{t("twoFactorEnterAppCode")}</Label>
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
                {tCommon("cancel")}
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
            {t("twoFactorSettingsTitle")}
          </CardTitle>
          <Badge variant="outline" className="text-muted-foreground">
            {t("twoFactorBadgeDisabled")}
          </Badge>
        </div>
        <CardDescription>
          {t("twoFactorNotEnabledDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleStartSetup} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          {t("twoFactorSetupConfirm")}
        </Button>
      </CardContent>
    </Card>
  );
}

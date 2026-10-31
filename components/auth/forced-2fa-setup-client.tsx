"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Monitor, Loader2, ShieldCheck, Fingerprint } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { confirmTotpSetup, normalizeTotpCode, registerPasskey, requestTotpSetup } from "@/lib/two-factor/enrollment-client";

type Step = "intro" | "scanning" | "passkey-setup" | "done";

export function Forced2FASetupClient() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("intro");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [showManualKey, setShowManualKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");

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
    setCode("");
    setStep("scanning");
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    if (normalizeTotpCode(code).length !== 6) return;

    setLoading(true);
    const result = await confirmTotpSetup(code);
    setLoading(false);

    if (!result.ok) {
      toast({ title: t("twoFactorInvalid"), description: result.error, variant: "destructive" });
      setCode("");
      return;
    }

    // Session cookie re-issued by the enable route — full navigation picks it up.
    setStep("done");
    window.location.replace("/");
  }

  async function handlePasskeySetup() {
    setPasskeyError("");
    setLoading(true);
    const result = await registerPasskey();
    if (!result.ok) {
      setPasskeyError(result.cancelled ? t("passkeyCancelled") : result.error || t("passkeyRegisterFailed"));
      setLoading(false);
      return;
    }
    // Session cookie re-issued by the verify route — full navigation picks it up.
    setStep("done");
    window.location.replace("/");
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Monitor className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">SAM</span>
          </div>
          <Card className="border-green-200">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <ShieldCheck className="h-12 w-12 text-green-500" />
                <h3 className="text-lg font-semibold">{t("twoFactorEnabled")}</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {t("twoFactorEnabledDescription")}
                </p>
                <Button onClick={() => { window.location.replace("/"); }} className="mt-2">
                  {tCommon("continue")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "scanning") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Monitor className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">SAM</span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("twoFactorSetupTitle")}</CardTitle>
              <CardDescription>
                {t("twoFactorSetupSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex justify-center">
                {qrCode && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrCode} alt={t("twoFactorQrAlt")} className="rounded-lg border" width={220} height={220} />
                )}
              </div>

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
                    <p className="text-xs text-muted-foreground mb-1">{t("twoFactorSetupSecret")}:</p>
                    <code className="text-sm font-mono select-all break-all">{secret}</code>
                    <p className="text-xs text-muted-foreground mt-1">
                      Type: Time-based · Period: 30s · Digits: 6
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <form onSubmit={handleEnable} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="totp-code">{t("twoFactorCode")}</Label>
                  <Input
                    id="totp-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="font-mono text-center tracking-widest text-xl h-12"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || code.length !== 6}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("twoFactorSetupConfirm")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "passkey-setup") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Monitor className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">SAM</span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("passkeySetupTitle")}</CardTitle>
              <CardDescription>{t("passkeySetupSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <Fingerprint className="h-10 w-10 text-primary" />
                <p className="text-sm text-muted-foreground">{t("passkeySetupPrompt")}</p>
              </div>
              {passkeyError && (
                <p className="text-sm text-destructive text-center">{passkeyError}</p>
              )}
              <Button onClick={handlePasskeySetup} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("passkeySetupTitle")}
              </Button>
              <Button variant="outline" onClick={() => setStep("intro")} className="w-full">
                {tCommon("back")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // intro step
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Monitor className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">SAM</span>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-500" />
              <CardTitle>{t("twoFactorSetupRequired")}</CardTitle>
            </div>
            <CardDescription>
              {t("twoFactorSetupSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={handleStartSetup} disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t("twoFactorSetupTitle")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep("passkey-setup")}
              disabled={loading}
              className="w-full"
            >
              <Fingerprint className="mr-2 h-4 w-4" />
              {t("passkeyUseInstead")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

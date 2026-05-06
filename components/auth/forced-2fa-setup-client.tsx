"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Monitor, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type Step = "intro" | "scanning" | "done";

export function Forced2FASetupClient() {
  const t = useTranslations("auth");
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("intro");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [showManualKey, setShowManualKey] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleStartSetup() {
    setLoading(true);
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    const data = await res.json();
    setQrCode(data.qrCodeDataUrl);
    setSecret(data.secret);
    setCode("");
    setStep("scanning");
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, "");
    if (trimmed.length !== 6) return;

    setLoading(true);
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Invalid code", description: err.error, variant: "destructive" });
      setCode("");
      return;
    }

    // Session cookie re-issued by the enable route — full navigation picks it up.
    setStep("done");
    window.location.href = "/";
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
                <Button onClick={() => { window.location.href = "/"; }} className="mt-2">
                  Continue
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
                  <img src={qrCode} alt="TOTP QR code" className="rounded-lg border" width={220} height={220} />
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
          <CardContent>
            <Button onClick={handleStartSetup} disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t("twoFactorSetupTitle")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

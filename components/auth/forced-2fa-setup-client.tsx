"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TotpEnrollmentForm } from "@/components/auth/totp-enrollment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, Fingerprint } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { confirmTotpSetup, normalizeTotpCode, registerPasskey, requestTotpSetup } from "@/components/auth/enrollment-api";

type Step = "intro" | "scanning" | "passkey-setup" | "done";

export function Forced2FASetupClient() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("intro");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
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
    );
  }

  if (step === "scanning") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("twoFactorSetupTitle")}</CardTitle>
          <CardDescription>
            {t("twoFactorSetupSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TotpEnrollmentForm qrCode={qrCode} secret={secret} code={code} onCodeChange={setCode} onSubmit={handleEnable}>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || code.length !== 6}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("twoFactorSetupConfirm")}
            </Button>
          </TotpEnrollmentForm>
        </CardContent>
      </Card>
    );
  }

  if (step === "passkey-setup") {
    return (
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
    );
  }

  // intro step
  return (
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
  );
}

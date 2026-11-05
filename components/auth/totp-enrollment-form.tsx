"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/**
 * The authenticator-app step of 2FA enrollment: QR code, manual-entry key and
 * the 6-digit confirmation field. Shared by the forced setup and the profile
 * settings; the caller owns the code state and passes its action buttons as
 * children.
 */
export function TotpEnrollmentForm({
  qrCode,
  secret,
  code,
  onCodeChange,
  onSubmit,
  children,
}: {
  qrCode: string;
  secret: string;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const [showManualKey, setShowManualKey] = useState(false);

  return (
    <div className="space-y-5">
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
            <p className="text-xs text-muted-foreground mb-1">{t("twoFactorManualKey")}</p>
            <code className="text-sm font-mono select-all break-all">{secret}</code>
            <p className="text-xs text-muted-foreground mt-1">{t("twoFactorManualKeyParams")}</p>
          </div>
        )}
      </div>

      <Separator />

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="totp-code">{t("twoFactorEnterAppCode")}</Label>
          <Input
            id="totp-code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="font-mono text-center tracking-widest text-xl h-12"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
        {children}
      </form>
    </div>
  );
}

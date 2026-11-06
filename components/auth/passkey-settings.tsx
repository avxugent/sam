"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Fingerprint, Loader2, Trash2, Info } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { registerPasskey } from "@/components/auth/enrollment-api";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";
import type { AuthProvider } from "@/lib/users/providers";

export type PasskeySummary = {
  id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

type Props = {
  provider: AuthProvider;
  /** Whether the current TOTP code can confirm a removal (else only a passkey can). */
  totpEnabled: boolean;
  passkeys: PasskeySummary[];
};

export function PasskeySettings({ provider, totpEnabled, passkeys: initialPasskeys }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [removeCode, setRemoveCode] = useState("");

  // Not applicable to SSO accounts
  if (provider !== "credentials") return null;

  async function handleAdd() {
    setLoading(true);
    const result = await registerPasskey(label);
    setLoading(false);
    if (!result.ok) {
      toast({
        title: tCommon("error"),
        description: result.cancelled ? t("passkeyCancelled") : result.error || t("passkeyRegisterFailed"),
        variant: "destructive",
      });
      return;
    }
    toast({ title: t("passkeyAdd") });
    setAdding(false);
    setLabel("");
    router.refresh();
  }

  // Removal needs a fresh second factor: the current TOTP code, or a passkey assertion.
  async function handleRemove(id: string, proof: { code: string } | { response: unknown }) {
    setRemoveCode("");
    const res = await apiFetch(`/api/auth/passkey/${id}`, jsonBody("DELETE", proof));
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setPasskeys((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  async function handleRemoveWithPasskey(id: string) {
    const options = await apiFetch<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
      "/api/auth/passkey/confirmation-options",
      { method: "POST" }
    );
    if (!options.ok) {
      showApiError(options.error);
      return;
    }
    let assertion;
    try {
      assertion = await startAuthentication({ optionsJSON: options.data.options });
    } catch (err) {
      const cancelled = err instanceof Error && err.name === "NotAllowedError";
      toast({ title: tCommon("error"), description: cancelled ? t("passkeyCancelled") : t("passkeyFailed"), variant: "destructive" });
      return;
    }
    await handleRemove(id, { response: assertion });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            {t("passkeyManageTitle")}
          </CardTitle>
          <Badge variant="outline">{passkeys.length}</Badge>
        </div>
        <CardDescription>{t("passkeyManageSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passkeys.length === 0 ? (
          <div className="flex items-start gap-3 text-muted-foreground">
            <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{t("passkeyNone")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("passkeyCreatedAt")} {new Date(p.createdAt).toLocaleDateString()}
                    {" · "}
                    {p.lastUsedAt
                      ? `${t("passkeyLastUsed")} ${new Date(p.lastUsedAt).toLocaleDateString()}`
                      : t("passkeyNeverUsed")}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t("passkeyRemove")} ${p.label}`}
                      className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("passkeyRemoveConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("passkeyRemoveConfirmDescription")}{" "}
                        {totpEnabled ? t("passkeyRemoveStepUpCodeOrPasskey") : t("passkeyRemoveStepUpPasskey")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {totpEnabled && (
                      <div className="px-6 pb-2">
                        <Label htmlFor={`remove-code-${p.id}`}>{t("twoFactorCurrentCode")}</Label>
                        <Input
                          id={`remove-code-${p.id}`}
                          value={removeCode}
                          onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="000000"
                          className="font-mono text-center tracking-widest mt-1.5"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                        />
                      </div>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setRemoveCode("")}>{tCommon("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRemoveWithPasskey(p.id)}>
                        <Fingerprint className="h-4 w-4 mr-1.5" />
                        {t("passkeyRemoveWithPasskey")}
                      </AlertDialogAction>
                      {totpEnabled && (
                        <AlertDialogAction
                          onClick={() => handleRemove(p.id, { code: removeCode })}
                          disabled={removeCode.length !== 6}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("passkeyRemove")}
                        </AlertDialogAction>
                      )}
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}

        <Separator />

        {adding ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="passkey-label">{t("passkeyLabel")}</Label>
              <Input
                id="passkey-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("passkeyLabelPlaceholder")}
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAdding(false)} className="flex-1" disabled={loading}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleAdd} disabled={loading} className="flex-1">
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {t("passkeyAdd")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Fingerprint className="h-4 w-4 mr-1.5" />
            {t("passkeyAdd")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

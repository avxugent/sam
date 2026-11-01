"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Monitor, Loader2, ShieldCheck, LogOut, Fingerprint } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { startAuthentication } from "@simplewebauthn/browser";
import { normalizeTotpCode } from "@/components/auth/enrollment-api";
import { apiFetch, jsonBody, apiErrorMessage } from "@/lib/api-client";

export function TwoFactorChallenge({ hasPasskey = false }: { hasPasskey?: boolean }) {
  const t = useTranslations("auth");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = normalizeTotpCode(code);
    if (trimmed.length !== 6) return;

    setLoading(true);
    setError("");

    const res = await apiFetch("/api/auth/2fa/verify", jsonBody("POST", { code: trimmed, rememberMe }));

    setLoading(false);

    if (!res.ok) {
      setError(apiErrorMessage(res.error, t("verificationFailed")));
      setCode("");
      inputRef.current?.focus();
      return;
    }

    // Full navigation forces the browser to re-read the updated session cookie.
    // router.push() is insufficient here because the new Set-Cookie header from
    // the signIn() call inside the verify route may not arrive in time before
    // the proxy checks the session on the next request.
    window.location.replace("/");
  }, [code, rememberMe, t]);

  const handlePasskey = useCallback(async () => {
    setPasskeyLoading(true);
    setError("");

    try {
      const options = await apiFetch<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
        "/api/auth/passkey/authentication-options",
        { method: "POST" }
      );
      if (!options.ok) {
        setError(apiErrorMessage(options.error, t("passkeyFailed")));
        return;
      }

      const assertion = await startAuthentication({ optionsJSON: options.data.options });

      const verify = await apiFetch("/api/auth/passkey/authentication-verify", jsonBody("POST", { response: assertion, rememberMe }));
      if (!verify.ok) {
        setError(apiErrorMessage(verify.error, t("passkeyFailed")));
        return;
      }

      // Same hard-navigation rationale as the TOTP path above.
      window.location.replace("/");
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? t("passkeyCancelled")
          : t("passkeyFailed")
      );
    } finally {
      setPasskeyLoading(false);
    }
  }, [rememberMe, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Monitor className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">SAM</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <ShieldCheck className="h-10 w-10 text-primary" />
            </div>
            <CardTitle>{t("twoFactorTitle")}</CardTitle>
            <CardDescription>
              {t("twoFactorSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">{t("twoFactorCode")}</Label>
                <Input
                  ref={inputRef}
                  id="code"
                  value={code}
                  onChange={(e) => {
                    // Only allow digits and spaces
                    const v = e.target.value.replace(/[^\d\s]/g, "");
                    if (normalizeTotpCode(v).length <= 6) setCode(v);
                  }}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={7} // 6 digits + possible space
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMe(!!v)}
                />
                <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                  {t("twoFactorRememberDevice")}
                </Label>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || normalizeTotpCode(code).length !== 6}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("twoFactorVerify")}
              </Button>

              {hasPasskey && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={passkeyLoading}
                  onClick={handlePasskey}
                >
                  {passkeyLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Fingerprint className="mr-2 h-4 w-4" />
                  )}
                  {t("passkeyUseInstead")}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("twoFactorBack")}
              </Button>
            </form>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Open your authenticator app (Google Authenticator, Aegis, 1Password, etc.)
              and enter the current 6-digit code for SAM.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

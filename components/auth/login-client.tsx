"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

// Microsoft logo as inline SVG to avoid external image dependency
function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginClient({ ssoEnabled }: { ssoEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sanitize callbackUrl — only accept same-origin relative paths
  const rawCallback = searchParams.get("callbackUrl") || "/";
  const safeCallback =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const t = useTranslations("auth");
  const tField = useTranslations("field");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("invalidCredentials"));
    } else {
      router.push(safeCallback);
      router.refresh();
    }
  }

  async function handleSso() {
    setSsoLoading(true);
    await signIn("microsoft-entra-id", { callbackUrl: safeCallback });
    // signIn with redirect=true (default) — page will navigate away
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("signIn")}</CardTitle>
        <CardDescription>
          {ssoEnabled
            ? t("signInSubtitleSso")
            : t("signInSubtitleCredentials")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Microsoft SSO button — shown only when configured */}
        {ssoEnabled && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleSso}
              disabled={ssoLoading}
            >
              {ssoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MicrosoftLogo />
              )}
              {t("signInWithEntra")}
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">{t("or")}</span>
              <Separator className="flex-1" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{tField("email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{tField("password")}</Label>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-required="true"
              autoComplete="current-password"
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("signIn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

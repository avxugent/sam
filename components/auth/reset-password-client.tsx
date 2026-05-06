"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Loader2, ArrowLeft } from "lucide-react";

export function ResetPasswordClient({ token }: { token: string }) {
  const t = useTranslations("auth");
  const router = useRouter();

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(
          `/api/auth/password-reset/validate?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        setTokenValid(data.valid === true);
      } catch {
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    }
    validate();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Monitor className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">SAM</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("passwordResetNewPasswordTitle")}</CardTitle>
            <CardDescription>{t("passwordResetNewPasswordSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validating ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="sr-only">{t("validating")}</span>
              </div>
            ) : !tokenValid ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive">
                  {t("tokenInvalid")}
                </p>
                <Link
                  href="/login/forgot-password"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Request a new link
                </Link>
              </div>
            ) : success ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("passwordResetSuccess")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("newPassword")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("passwordReset")}
                </Button>
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

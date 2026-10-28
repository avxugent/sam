"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Loader2, ShieldAlert } from "lucide-react";
import { buildPasswordChangeSchema, type PasswordChangeValues } from "@/lib/schemas/password";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

export function ForcedPasswordChangeClient() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [serverError, setServerError] = useState("");

  const passwordSchema = useMemo(
    () =>
      buildPasswordChangeSchema({
        currentRequired: t("currentPasswordRequired"),
        tooShort: t("passwordTooShort"),
        confirmRequired: t("confirmPasswordRequired"),
        mismatch: t("passwordMismatch"),
      }),
    [t]
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeValues>({ resolver: zodResolver(passwordSchema) });

  async function onSubmit(data: PasswordChangeValues) {
    setServerError("");
    const res = await apiFetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      }),
    });

    if (!res.ok) {
      setServerError(apiErrorMessage(res.error, tCommon("somethingWentWrong")));
      return;
    }

    // The JWT still carries needsPasswordChange=true — it is baked in and cannot
    // be updated in place. Sign out so the user logs back in with the new password
    // and receives a clean session without the flag.
    await signOut({ callbackUrl: "/login" });
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
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle>{t("passwordChangeTitle")}</CardTitle>
            </div>
            <CardDescription>
              {t("passwordChangeRequired")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...register("currentPassword")}
                  className={errors.currentPassword ? "border-destructive" : ""}
                />
                {errors.currentPassword && (
                  <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">{t("newPassword")}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("newPassword")}
                  className={errors.newPassword ? "border-destructive" : ""}
                />
                {errors.newPassword && (
                  <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                  className={errors.confirmPassword ? "border-destructive" : ""}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              {serverError && (
                <p className="text-sm text-destructive">{serverError}</p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? tCommon("saving") : tCommon("save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

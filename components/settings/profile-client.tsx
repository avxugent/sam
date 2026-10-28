"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sun, Moon, Monitor } from "lucide-react";
import { cn, apiErrorMessage } from "@/lib/utils";
import { useTheme, type Theme } from "@/components/theme-provider";
import { LOCATION_TABS, toLocationTab, type LocationTab } from "@/lib/user-preferences";
import { buildPasswordChangeSchema, type PasswordChangeValues } from "@/lib/schemas/password";

const nameSchema = z.object({
  name: z.string().min(1, "Name is required.").max(128, "Name is too long."),
});

type NameForm = z.infer<typeof nameSchema>;

type Props = {
  name: string;
  email: string;
  provider: string;
  locationDefaultTab?: string;
  serverTheme?: string;
};

export function ProfileClient({
  name,
  email,
  provider,
  locationDefaultTab = "assets",
  serverTheme: _serverTheme,
}: Props) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const { toast } = useToast();
  const isCredentials = provider === "credentials";

  // ── Name form ──────────────────────────────────────────────────────────────
  const {
    register: registerName,
    handleSubmit: handleNameSubmit,
    formState: { errors: nameErrors },
  } = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name } });

  /** PATCH /api/users/me with `saving` set meanwhile; toasts the error and returns false on failure. */
  async function patchMe(body: object, setSaving: (saving: boolean) => void): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err, tCommon("somethingWentWrong")), variant: "destructive" });
    } catch {
      toast({ title: tCommon("error"), description: tCommon("somethingWentWrong"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
    return false;
  }

  const [nameSaving, setNameSaving] = useState(false);

  async function onNameSubmit(data: NameForm) {
    if (await patchMe({ name: data.name }, setNameSaving)) {
      toast({ title: t("profileTitle") });
      router.refresh();
    }
  }

  // ── Password form ──────────────────────────────────────────────────────────
  const passwordSchema = useMemo(
    () =>
      buildPasswordChangeSchema({
        currentRequired: tAuth("currentPasswordRequired"),
        tooShort: tAuth("passwordTooShort"),
        confirmRequired: tAuth("confirmPasswordRequired"),
        mismatch: tAuth("passwordMismatch"),
      }),
    [tAuth]
  );
  const {
    register: registerPw,
    handleSubmit: handlePwSubmit,
    formState: { errors: pwErrors },
    reset: resetPw,
  } = useForm<PasswordChangeValues>({ resolver: zodResolver(passwordSchema) });

  const [pwSaving, setPwSaving] = useState(false);

  // ── Theme preference ───────────────────────────────────────────────────────
  const { theme: currentTheme, setTheme } = useTheme();
  const [themeSaving, setThemeSaving] = useState(false);

  async function saveTheme(value: Theme) {
    setTheme(value); // instant local update
    if (await patchMe({ theme: value }, setThemeSaving)) {
      toast({ title: t("preferencesSaved") });
    }
  }

  // ── Location preference ────────────────────────────────────────────────────
  const [locTab, setLocTab] = useState<LocationTab>(toLocationTab(locationDefaultTab));
  const [locTabSaving, setLocTabSaving] = useState(false);

  async function saveLocTab(value: LocationTab) {
    setLocTab(value);
    if (await patchMe({ locationDefaultTab: value }, setLocTabSaving)) {
      toast({ title: t("preferencesSaved") });
    }
  }

  async function onPasswordSubmit(data: PasswordChangeValues) {
    const { currentPassword, newPassword, confirmPassword } = data;
    if (await patchMe({ currentPassword, newPassword, confirmPassword }, setPwSaving)) {
      toast({ title: t("passwordChanged") });
      resetPw();
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profileTitle")}</CardTitle>
          <CardDescription>{t("profileSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNameSubmit(onNameSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">
                {tField("name")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...registerName("name")}
                className={cn(nameErrors.name && "border-destructive")}
                autoComplete="name"
              />
              {nameErrors.name && (
                <p className="text-xs text-destructive">{nameErrors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{tField("email")}</Label>
              <Input id="email" value={email} disabled className="bg-muted" />
            </div>
            <Button type="submit" disabled={nameSaving}>
              {nameSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {nameSaving ? tCommon("saving") : tCommon("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password — credentials users only */}
      {isCredentials && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("changePassword")}</CardTitle>
            <CardDescription>{t("profileSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePwSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">
                  {tAuth("currentPassword")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  {...registerPw("currentPassword")}
                  className={cn(pwErrors.currentPassword && "border-destructive")}
                  autoComplete="current-password"
                />
                {pwErrors.currentPassword && (
                  <p className="text-xs text-destructive">{pwErrors.currentPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">
                  {tAuth("newPassword")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  {...registerPw("newPassword")}
                  className={cn(pwErrors.newPassword && "border-destructive")}
                  autoComplete="new-password"
                />
                {pwErrors.newPassword && (
                  <p className="text-xs text-destructive">{pwErrors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">
                  {tAuth("confirmPassword")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  {...registerPw("confirmPassword")}
                  className={cn(pwErrors.confirmPassword && "border-destructive")}
                  autoComplete="new-password"
                />
                {pwErrors.confirmPassword && (
                  <p className="text-xs text-destructive">{pwErrors.confirmPassword.message}</p>
                )}
              </div>
              <Button type="submit" disabled={pwSaving}>
                {pwSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {pwSaving ? tCommon("saving") : tCommon("save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!isCredentials && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {t("profileSubtitle")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Theme preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("themeTitle")}</CardTitle>
          <CardDescription>{t("themeSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "light" as Theme, icon: Sun, labelKey: "themeLight" as const },
              { value: "dark" as Theme, icon: Moon, labelKey: "themeDark" as const },
              { value: "system" as Theme, icon: Monitor, labelKey: "themeSystem" as const },
            ]).map(({ value, icon: Icon, labelKey }) => {
              const active = currentTheme === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={themeSaving}
                  onClick={() => saveTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-[8px] border px-3 py-4 text-sm transition-colors",
                    active
                      ? "border-[#1e64c8] bg-[#eff6ff] text-[#1e64c8] font-medium"
                      : "border-border bg-card text-foreground hover:border-[#94a3b8]"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-[#1e64c8]" : "text-muted-foreground")} />
                  <span className="text-xs">{t(labelKey)}</span>
                </button>
              );
            })}
          </div>
          {themeSaving && <p className="text-xs text-muted-foreground mt-2">{tCommon("saving")}…</p>}
        </CardContent>
      </Card>

      {/* Location navigation preference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("locationNavTitle")}</CardTitle>
          <CardDescription>{t("locationNavSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {LOCATION_TABS.map((value) => {
            const active = locTab === value;
            return (
              <button
                key={value}
                type="button"
                disabled={locTabSaving}
                onClick={() => saveLocTab(value)}
                className={cn(
                  "w-full text-left rounded-[8px] border px-4 py-3 text-sm transition-colors",
                  active
                    ? "border-[#1e64c8] bg-[#eff6ff] text-[#1e64c8] font-medium"
                    : "border-border bg-card text-foreground hover:border-[#94a3b8]"
                )}
              >
                <span className="font-medium">
                  {value === "assets" ? t("locationNavAssets") : t("locationNavSublocations")}
                </span>
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {value === "assets" ? t("locationNavAssetsDesc") : t("locationNavSublocationsDesc")}
                </p>
              </button>
            );
          })}
          {locTabSaving && <p className="text-xs text-muted-foreground">{tCommon("saving")}…</p>}
        </CardContent>
      </Card>
    </div>
  );
}

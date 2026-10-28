"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { cn, apiErrorMessage } from "@/lib/utils";
import type { BackgroundMode } from "@/lib/background-mode";


export function BrandingSettingsClient({
  initialAppTitle,
  initialHasLogo,
  initialHasFavicon,
  initialBackgroundMode,
  initialHasCustomBackground,
}: {
  initialAppTitle: string;
  initialHasLogo: boolean;
  initialHasFavicon: boolean;
  initialBackgroundMode: BackgroundMode;
  initialHasCustomBackground: boolean;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();

  const [appTitle, setAppTitle] = useState(initialAppTitle);
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  const [hasFavicon, setHasFavicon] = useState(initialHasFavicon);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(initialBackgroundMode);
  const [hasCustomBackground, setHasCustomBackground] = useState(initialHasCustomBackground);

  const [savingTitle, setSavingTitle] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [removingFavicon, setRemovingFavicon] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [savingBackground, setSavingBackground] = useState(false);

  const [logoVersion, setLogoVersion] = useState(0);
  const [faviconVersion, setFaviconVersion] = useState(0);
  const [backgroundVersion, setBackgroundVersion] = useState(0);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  async function handleSaveTitle() {
    if (!appTitle.trim()) return;
    setSavingTitle(true);
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appTitle: appTitle.trim() }),
    });
    setSavingTitle(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    toast({ title: t("saved") });
    router.refresh();
  }

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/branding/logo", { method: "POST", body: fd });
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setHasLogo(true);
    setLogoVersion((v) => v + 1);
    toast({ title: t("logoUploaded") });
    router.refresh();
  }

  async function handleRemoveLogo() {
    setRemovingLogo(true);
    const res = await fetch("/api/settings/branding/logo", { method: "DELETE" });
    setRemovingLogo(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setHasLogo(false);
    setLogoVersion((v) => v + 1);
    toast({ title: t("logoRemoved") });
    router.refresh();
  }

  async function handleUploadFavicon(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFavicon(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/branding/favicon", { method: "POST", body: fd });
    setUploadingFavicon(false);
    if (faviconInputRef.current) faviconInputRef.current.value = "";
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setHasFavicon(true);
    setFaviconVersion((v) => v + 1);
    toast({ title: t("faviconUploaded") });
    router.refresh();
  }

  async function handleRemoveFavicon() {
    setRemovingFavicon(true);
    const res = await fetch("/api/settings/branding/favicon", { method: "DELETE" });
    setRemovingFavicon(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setHasFavicon(false);
    setFaviconVersion((v) => v + 1);
    toast({ title: t("faviconRemoved") });
    router.refresh();
  }

  async function handleSelectBackgroundMode(mode: BackgroundMode) {
    if (mode === "custom") {
      backgroundInputRef.current?.click();
      return;
    }
    setSavingBackground(true);
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backgroundMode: mode }),
    });
    setSavingBackground(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setBackgroundMode(mode);
    toast({ title: t("saved") });
    router.refresh();
  }

  async function handleUploadBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBackground(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/branding/background", { method: "POST", body: fd });
    setUploadingBackground(false);
    if (backgroundInputRef.current) backgroundInputRef.current.value = "";
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setBackgroundMode("custom");
    setHasCustomBackground(true);
    setBackgroundVersion((v) => v + 1);
    toast({ title: t("backgroundUploaded") });
    router.refresh();
  }

  async function handleRemoveBackground() {
    setRemovingBackground(true);
    const res = await fetch("/api/settings/branding/background", { method: "DELETE" });
    setRemovingBackground(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setBackgroundMode("");
    setHasCustomBackground(false);
    setBackgroundVersion((v) => v + 1);
    toast({ title: t("backgroundRemoved") });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* App title */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("brandingTitle")}</h2>
          <p className="text-[13px] text-muted-foreground mt-1">{t("brandingSubtitle")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="app-title">{t("appTitle")}</Label>
          <div className="flex gap-2">
            <Input
              id="app-title"
              value={appTitle}
              onChange={(e) => setAppTitle(e.target.value)}
              placeholder="SAM"
              maxLength={100}
              className="max-w-xs"
            />
            <Button onClick={handleSaveTitle} disabled={savingTitle || !appTitle.trim()} className="gap-2 flex-shrink-0">
              {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingTitle ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">{t("appTitleHelp")}</p>
        </div>
      </section>

      {/* Logo */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("logo")}</h2>
          <p className="text-[13px] text-muted-foreground mt-1">{t("logoHelp")}</p>
        </div>

        {hasLogo ? (
          <div className="p-3 bg-background border border-border rounded-[8px] inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/branding/logo?v=${logoVersion}`} alt="Logo" className="h-8 w-8 object-contain" />
          </div>
        ) : (
          <div className="p-4 bg-background border border-dashed border-[#cbd5e1] rounded-[8px] flex items-center gap-3 text-[#94a3b8]">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[13px]">{t("noLogoUploaded")}</span>
          </div>
        )}

        <div className="flex gap-2">
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleUploadLogo} />
          <Button variant="outline" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="gap-2">
            {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("uploadLogo")}
          </Button>
          {hasLogo && (
            <Button variant="outline" onClick={handleRemoveLogo} disabled={removingLogo} className="gap-2 text-destructive hover:text-destructive">
              {removingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("removeLogo")}
            </Button>
          )}
        </div>
      </section>

      {/* Favicon */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("favicon")}</h2>
          <p className="text-[13px] text-muted-foreground mt-1">{t("faviconHelp")}</p>
        </div>

        {hasFavicon ? (
          <div className="p-3 bg-background border border-border rounded-[8px] inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/branding/favicon?v=${faviconVersion}`} alt="Favicon" className="h-8 w-8 object-contain" />
          </div>
        ) : (
          <div className="p-4 bg-background border border-dashed border-[#cbd5e1] rounded-[8px] flex items-center gap-3 text-[#94a3b8]">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[13px]">{t("noFaviconUploaded")}</span>
          </div>
        )}

        <div className="flex gap-2">
          <input ref={faviconInputRef} type="file" accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,.ico" className="hidden" onChange={handleUploadFavicon} />
          <Button variant="outline" onClick={() => faviconInputRef.current?.click()} disabled={uploadingFavicon} className="gap-2">
            {uploadingFavicon ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("uploadFavicon")}
          </Button>
          {hasFavicon && (
            <Button variant="outline" onClick={handleRemoveFavicon} disabled={removingFavicon} className="gap-2 text-destructive hover:text-destructive">
              {removingFavicon ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("removeFavicon")}
            </Button>
          )}
        </div>
      </section>

      {/* Environment background */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("backgroundTitle")}</h2>
          <p className="text-[13px] text-muted-foreground mt-1">{t("backgroundSubtitle")}</p>
        </div>

        {/* Mode picker */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "", label: t("backgroundNone") },
              { value: "preset:testing", label: t("backgroundPresetTesting") },
              { value: "custom", label: t("backgroundCustom") },
            ] satisfies { value: BackgroundMode; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSelectBackgroundMode(value)}
              disabled={savingBackground || uploadingBackground}
              className={cn(
                "px-3 py-1.5 rounded-[8px] text-[13px] border transition-colors",
                backgroundMode === value || (value === "custom" && backgroundMode === "custom")
                  ? "border-[#1e64c8] bg-[#eff6ff] text-[#1e64c8] font-medium"
                  : "border-border bg-card text-[#334155] hover:border-[#94a3b8]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom image upload + preview */}
        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp"
          className="hidden"
          onChange={handleUploadBackground}
        />

        {backgroundMode === "custom" && hasCustomBackground && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">{t("backgroundImageHelp")}</p>
            <div className="p-3 bg-background border border-border rounded-[8px] inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/branding/background?v=${backgroundVersion}`}
                alt="Background"
                className="h-20 max-w-[240px] object-contain"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => backgroundInputRef.current?.click()} disabled={uploadingBackground} className="gap-2">
                {uploadingBackground ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("uploadBackground")}
              </Button>
              <Button variant="outline" onClick={handleRemoveBackground} disabled={removingBackground} className="gap-2 text-destructive hover:text-destructive">
                {removingBackground ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("removeBackground")}
              </Button>
            </div>
          </div>
        )}

        {backgroundMode === "custom" && !hasCustomBackground && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">{t("backgroundImageHelp")}</p>
            <div className="p-4 bg-background border border-dashed border-[#cbd5e1] rounded-[8px] flex items-center gap-3 text-[#94a3b8]">
              <ImageIcon className="h-6 w-6" />
              <span className="text-[13px]">{t("noBackgroundUploaded")}</span>
            </div>
            <Button variant="outline" onClick={() => backgroundInputRef.current?.click()} disabled={uploadingBackground} className="gap-2">
              {uploadingBackground ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("uploadBackground")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

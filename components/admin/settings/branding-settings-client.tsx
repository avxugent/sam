"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BackgroundMode } from "@/lib/branding/background-mode";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";


type BrandingAssetKind = "logo" | "favicon" | "background";

/**
 * Upload / remove state for one branding file: whether it exists, the busy
 * flags, the file input, and a version that busts the preview's cache.
 */
function useBrandingAsset(
  kind: BrandingAssetKind,
  initialHas: boolean,
  { onUploaded, onRemoved }: { onUploaded?: () => void; onRemoved?: () => void } = {}
) {
  const t = useTranslations("settings");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const router = useRouter();
  const [has, setHas] = useState(initialHas);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [version, setVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endpoint = `/api/settings/branding/${kind}`;

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(endpoint, { method: "POST", body: fd });
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setHas(true);
    setVersion((v) => v + 1);
    onUploaded?.();
    toast({ title: t(`${kind}Uploaded`) });
    router.refresh();
  }

  async function remove() {
    setRemoving(true);
    const res = await apiFetch(endpoint, { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setHas(false);
    setVersion((v) => v + 1);
    onRemoved?.();
    toast({ title: t(`${kind}Removed`) });
    router.refresh();
  }

  return { has, uploading, removing, version, inputRef, upload, remove, pick: () => inputRef.current?.click() };
}

/** The logo or favicon section: preview, upload and remove. */
function BrandingImageSection({
  kind,
  initialHas,
  accept,
  alt,
  labels,
}: {
  kind: "logo" | "favicon";
  initialHas: boolean;
  accept: string;
  alt: string;
  labels: { title: string; help: string; none: string; upload: string; remove: string };
}) {
  const { has, uploading, removing, version, inputRef, upload, remove, pick } = useBrandingAsset(kind, initialHas);

  return (
    <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{labels.title}</h2>
        <p className="text-[13px] text-muted-foreground mt-1">{labels.help}</p>
      </div>

      {has ? (
        <div className="p-3 bg-background border border-border rounded-[8px] inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/branding/${kind}?v=${version}`} alt={alt} className="h-8 w-8 object-contain" />
        </div>
      ) : (
        <div className="p-4 bg-background border border-dashed border-input rounded-[8px] flex items-center gap-3 text-subtle">
          <ImageIcon className="h-6 w-6" />
          <span className="text-[13px]">{labels.none}</span>
        </div>
      )}

      <div className="flex gap-2">
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={upload} />
        <Button variant="outline" onClick={pick} disabled={uploading} className="gap-2">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {labels.upload}
        </Button>
        {has && (
          <Button variant="outline" onClick={remove} disabled={removing} className="gap-2 text-destructive hover:text-destructive">
            {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {labels.remove}
          </Button>
        )}
      </div>
    </section>
  );
}

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
  const showApiError = useApiErrorToast();
  const router = useRouter();

  const [appTitle, setAppTitle] = useState(initialAppTitle);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(initialBackgroundMode);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingBackground, setSavingBackground] = useState(false);
  const {
    has: hasCustomBackground,
    uploading: uploadingBackground,
    removing: removingBackground,
    version: backgroundVersion,
    inputRef: backgroundInputRef,
    upload: handleUploadBackground,
    remove: handleRemoveBackground,
    pick: pickBackground,
  } = useBrandingAsset("background", initialHasCustomBackground, {
    onUploaded: () => setBackgroundMode("custom"),
    onRemoved: () => setBackgroundMode(""),
  });

  async function handleSaveTitle() {
    if (!appTitle.trim()) return;
    setSavingTitle(true);
    const res = await apiFetch("/api/settings/branding", jsonBody("PUT", { appTitle: appTitle.trim() }));
    setSavingTitle(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    toast({ title: t("saved") });
    router.refresh();
  }

  async function handleSelectBackgroundMode(mode: BackgroundMode) {
    if (mode === "custom") {
      pickBackground();
      return;
    }
    setSavingBackground(true);
    const res = await apiFetch("/api/settings/branding", jsonBody("PUT", { backgroundMode: mode }));
    setSavingBackground(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setBackgroundMode(mode);
    toast({ title: t("saved") });
    router.refresh();
  }

  return (
    <div className="space-y-6">
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

      <BrandingImageSection
        kind="logo"
        initialHas={initialHasLogo}
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        alt="Logo"
        labels={{ title: t("logo"), help: t("logoHelp"), none: t("noLogoUploaded"), upload: t("uploadLogo"), remove: t("removeLogo") }}
      />

      <BrandingImageSection
        kind="favicon"
        initialHas={initialHasFavicon}
        accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,.ico"
        alt="Favicon"
        labels={{ title: t("favicon"), help: t("faviconHelp"), none: t("noFaviconUploaded"), upload: t("uploadFavicon"), remove: t("removeFavicon") }}
      />

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
                  ? "border-primary bg-info-surface text-primary font-medium"
                  : "border-border bg-card text-secondary-foreground hover:border-subtle"
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
              <Button variant="outline" onClick={pickBackground} disabled={uploadingBackground} className="gap-2">
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
            <div className="p-4 bg-background border border-dashed border-input rounded-[8px] flex items-center gap-3 text-subtle">
              <ImageIcon className="h-6 w-6" />
              <span className="text-[13px]">{t("noBackgroundUploaded")}</span>
            </div>
            <Button variant="outline" onClick={pickBackground} disabled={uploadingBackground} className="gap-2">
              {uploadingBackground ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("uploadBackground")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

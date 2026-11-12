"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";
import { createApiKeySchema, MAX_API_KEY_DAYS } from "@/lib/schemas/api-key";
import { cn } from "@/lib/utils";
import type { z } from "zod";

export type ApiKeySummary = {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type FormValues = z.input<typeof createApiKeySchema>;

export function ApiKeysSettings({ keys: initialKeys }: { keys: ApiKeySummary[] }) {
  const t = useTranslations("settings.apiKeys");
  const tCommon = useTranslations("common");
  const showApiError = useApiErrorToast();
  const [keys, setKeys] = useState(initialKeys);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(createApiKeySchema), defaultValues: { label: "" } });

  async function onCreate(values: FormValues) {
    const res = await apiFetch<ApiKeySummary & { key: string }>("/api/users/me/api-keys", jsonBody("POST", values));
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    const { key, ...summary } = res.data;
    setKeys((prev) => [summary, ...prev]);
    setNewKey(key);
    setCopied(false);
    reset({ label: "" });
  }

  async function onRevoke(id: string) {
    const res = await apiFetch(`/api/users/me/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(newKey ?? "");
      setCopied(true);
    } catch {
      // Clipboard blocked: the key stays selectable in the field.
    }
  }

  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {t("title")}
          </CardTitle>
          <Badge variant="outline">{keys.length}</Badge>
        </div>
        <CardDescription>{t("subtitle", { endpoint })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {newKey && (
          <div className="rounded-[8px] border border-primary bg-info-surface p-4 space-y-2" role="status">
            <p className="text-sm font-medium">{t("newKeyTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("newKeyDescription")}</p>
            <div className="flex gap-2">
              <Input readOnly value={newKey} aria-label={t("newKeyTitle")} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={copyKey}>
                {copied ? t("copied") : t("copy")}
              </Button>
              <Button type="button" onClick={() => setNewKey(null)}>
                {t("done")}
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="space-y-3">
            {keys.map((k) => {
              const expired = k.expiresAt !== null && new Date(k.expiresAt) <= new Date();
              return (
                <li key={k.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {k.label} <span className="font-mono text-xs text-muted-foreground">{k.keyPrefix}…</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("createdAt")} {new Date(k.createdAt).toLocaleDateString()}
                      {" · "}
                      {k.lastUsedAt ? `${t("lastUsed")} ${new Date(k.lastUsedAt).toLocaleDateString()}` : t("neverUsed")}
                      {" · "}
                      <span className={cn(expired && "text-destructive")}>
                        {k.expiresAt ? `${t("expires")} ${new Date(k.expiresAt).toLocaleDateString()}` : t("neverExpires")}
                        {expired && ` (${t("expired")})`}
                      </span>
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t("revoke")} ${k.label}`}
                        className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("revokeConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("revokeConfirmDescription")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onRevoke(k.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("revoke")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleSubmit(onCreate)} className="space-y-3 border-t pt-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-label">
                {t("label")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="api-key-label"
                placeholder={t("labelPlaceholder")}
                className={cn(errors.label && "border-destructive")}
                {...register("label")}
              />
              {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-key-days">{t("expiresInDays")}</Label>
              <Input
                id="api-key-days"
                type="number"
                min={1}
                max={MAX_API_KEY_DAYS}
                className={cn(errors.expiresInDays && "border-destructive")}
                {...register("expiresInDays", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
              />
              {errors.expiresInDays ? (
                <p className="text-xs text-destructive">{errors.expiresInDays.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("expiresHelp")}</p>
              )}
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {t("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

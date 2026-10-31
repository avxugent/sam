"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch, jsonBody } from "@/lib/api-client";
import type { Attachment } from "@/components/attachments/attachment";

/** Adds a link attachment to the location or asset; the form clears after a successful add. */
export function AddLinkDialog({
  open,
  onOpenChange,
  locationId,
  assetId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId?: string;
  assetId?: string;
  onAdded: (attachment: Attachment) => void;
}) {
  const t = useTranslations("attachment");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || !linkLabel) return;
    setAdding(true);
    const res = await apiFetch<Attachment>("/api/attachments", jsonBody("POST", { url, label: linkLabel, description: description || null, locationId, assetId }));
    setAdding(false);
    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }
    onAdded(res.data);
    onOpenChange(false);
    setUrl(""); setLinkLabel(""); setDescription("");
    toast({ title: t("linked") });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("addLink")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="link-url">{t("linkUrl")} <span className="text-destructive">*</span></Label>
            <Input id="link-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-label">{t("linkLabel")} <span className="text-destructive">*</span></Label>
            <Input id="link-label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder={t("linkLabel")} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-desc">{t("descriptionLabel")}</Label>
            <Textarea id="link-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
            <Button type="submit" disabled={adding || !url || !linkLabel}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addLinkSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { apiFetch, jsonBody } from "@/lib/api-client";
import type { Attachment } from "@/components/attachments/attachment";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

/** Rename / describe an attachment (and change a link's URL); open while `attachment` is set. */
export function EditAttachmentDialog({
  attachment,
  onClose,
  onSaved,
}: {
  attachment: Attachment | null;
  onClose: () => void;
  onSaved: (attachment: Attachment) => void;
}) {
  return (
    <Dialog open={!!attachment} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        {/* Keyed so the fields start from each attachment's current values. */}
        {attachment && <EditForm key={attachment.id} attachment={attachment} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ attachment, onClose, onSaved }: { attachment: Attachment; onClose: () => void; onSaved: (attachment: Attachment) => void }) {
  const t = useTranslations("attachment");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const isLink = attachment.attachmentType === "link";
  const [displayName, setDisplayName] = useState(attachment.displayName ?? "");
  const [description, setDescription] = useState(attachment.description ?? "");
  const [url, setUrl] = useState(attachment.url ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await apiFetch<Attachment>(`/api/attachments/${attachment.id}`, jsonBody("PATCH", {
      displayName: displayName.trim() || null,
      description: description.trim() || null,
      ...(isLink && { url: url.trim() || null }),
    }));
    setSaving(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    onSaved(res.data);
    onClose();
    toast({ title: t("attachmentUpdated") });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("editAttachment")}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {isLink && (
          <div className="space-y-1.5">
            <Label htmlFor="edit-url">{t("linkUrl")} <span className="text-destructive">*</span></Label>
            <Input
              id="edit-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="edit-display-name">{t("displayName")}</Label>
          <Input
            id="edit-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("displayNamePlaceholder")}
            maxLength={255}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-description">{t("descriptionLabel")}</Label>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={3}
            maxLength={2000}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon("saveChanges")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

"use client";

import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatFileSize, apiErrorMessage } from "@/lib/utils";
import {
  FileText,
  File,
  Link2,
  Trash2,
  Upload,
  Download,
  Loader2,
  Paperclip,
  Plus,
  ExternalLink,
  Pencil,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export type Attachment = {
  id: string;
  attachmentType?: string;
  filename?: string | null;
  originalName: string;
  displayName?: string | null;
  description?: string | null;
  mimeType?: string | null;
  size?: number | null;
  url?: string | null;
  createdAt: Date | string;
  uploadedBy: { id: string; name: string };
};

function label(att: Attachment) {
  return att.displayName?.trim() || att.originalName;
}

function isPreviewableImage(mimeType?: string | null) {
  return (
    mimeType?.startsWith("image/") &&
    mimeType !== "image/svg+xml" // SVG forced to download by server
  );
}

/** Controlled: the parent owns the list; changes go through `onUpdate` as updaters. */
export function AttachmentGallery({
  attachments,
  locationId,
  assetId,
  canEdit,
  onUpdate,
}: {
  attachments: Attachment[];
  locationId?: string;
  assetId?: string;
  canEdit: boolean;
  onUpdate: Dispatch<SetStateAction<Attachment[]>>;
}) {
  const t = useTranslations("attachment");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Link dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  // Edit (rename/describe) dialog
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editIsLink, setEditIsLink] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lightbox
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const previewable = attachments.filter((a) =>
    a.attachmentType !== "link" && isPreviewableImage(a.mimeType)
  );
  const lightboxIndex = previewable.findIndex((a) => a.id === lightboxId);
  const lightboxAttachment = lightboxIndex >= 0 ? previewable[lightboxIndex] : undefined;
  const hasMultiple = previewable.length > 1;

  function showAdjacent(delta: number) {
    if (lightboxIndex < 0 || previewable.length === 0) return;
    const next = (lightboxIndex + delta + previewable.length) % previewable.length;
    setLightboxId(previewable[next].id);
  }

  useEffect(() => {
    if (!lightboxId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") showAdjacent(1);
      else if (e.key === "ArrowLeft") showAdjacent(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxId, previewable.length]);

  function openEdit(att: Attachment) {
    setEditingId(att.id);
    setEditDisplayName(att.displayName ?? "");
    setEditDescription(att.description ?? "");
    setEditUrl(att.url ?? "");
    setEditIsLink(att.attachmentType === "link");
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      if (locationId) formData.append("locationId", locationId);
      if (assetId) formData.append("assetId", assetId);
      const res = await fetch("/api/attachments", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: t("uploadFailed"), description: apiErrorMessage(err, file.name), variant: "destructive" });
      } else {
        const attachment = await res.json();
        onUpdate((current) => [attachment, ...current]);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl || !linkLabel) return;
    setAddingLink(true);
    const res = await fetch("/api/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkUrl, label: linkLabel, description: linkDesc || null, locationId, assetId }),
    });
    setAddingLink(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    const attachment = await res.json();
    onUpdate((current) => [attachment, ...current]);
    setShowLinkDialog(false);
    setLinkUrl(""); setLinkLabel(""); setLinkDesc("");
    toast({ title: t("linked") });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    const res = await fetch(`/api/attachments/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: editDisplayName.trim() || null,
        description: editDescription.trim() || null,
        ...(editIsLink && { url: editUrl.trim() || null }),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    const updated = await res.json();
    onUpdate((current) => current.map((a) => (a.id === editingId ? updated : a)));
    setEditingId(null);
    toast({ title: t("attachmentUpdated") });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    toast({ title: t("deleted") });
    onUpdate((current) => current.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {canEdit && (
        <div
          className={`border-2 border-dashed rounded-[10px] px-5 py-7 text-center transition-colors cursor-pointer bg-card ${
            dragOver ? "border-primary bg-primary-tint" : "border-[#cbd5e1]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[13px]">{tCommon("uploading")}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Upload className="h-7 w-7 mx-auto text-subtle" />
              <p className="text-[13px] text-muted-foreground">
                Drag &amp; drop files here, or{" "}
                <span className="text-primary hover:underline">browse</span>
              </p>
              <p className="text-[11.5px] text-subtle">Images, PDF, Word, Excel, CSV — max 50 MB</p>
            </div>
          )}
        </div>
      )}

      {/* Add link button */}
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border text-secondary-foreground text-[12px]"
          onClick={() => setShowLinkDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addLink")}
        </Button>
      )}

      {/* Add link dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("addLink")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLink} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="link-url">{t("linkUrl")} <span className="text-destructive">*</span></Label>
              <Input id="link-url" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-label">{t("linkLabel")} <span className="text-destructive">*</span></Label>
              <Input id="link-label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder={t("linkLabel")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-desc">{t("descriptionLabel")}</Label>
              <Textarea id="link-desc" value={linkDesc} onChange={(e) => setLinkDesc(e.target.value)} placeholder={t("descriptionPlaceholder")} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowLinkDialog(false)}>{tCommon("cancel")}</Button>
              <Button type="submit" disabled={addingLink || !linkUrl || !linkLabel}>
                {addingLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("addLinkSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit (rename / describe) dialog */}
      <Dialog open={!!editingId} onOpenChange={(v) => { if (!v) setEditingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("editAttachment")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 pt-1">
            {editIsLink && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-url">{t("linkUrl")} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-url"
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-display-name">{t("displayName")}</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder={t("displayNamePlaceholder")}
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">{t("descriptionLabel")}</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
                maxLength={2000}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>{tCommon("cancel")}</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tCommon("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxId} onOpenChange={(v) => { if (!v) setLightboxId(null); }}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader className="p-3 pb-0">
            <DialogTitle className="text-[14px] font-medium truncate">
              {lightboxAttachment ? label(lightboxAttachment) : ""}
            </DialogTitle>
          </DialogHeader>
          {lightboxAttachment && (
            <div className="flex flex-col items-center gap-3 p-2">
              <div className="relative flex w-full items-center justify-center">
                {hasMultiple && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={tCommon("previous")}
                    className="absolute left-1 z-10 h-9 w-9 rounded-full bg-background/90 text-foreground shadow-sm"
                    onClick={() => showAdjacent(-1)}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/attachments/${lightboxAttachment.id}`}
                  alt={t("previewAlt", { name: label(lightboxAttachment) })}
                  className="max-h-[70vh] max-w-full rounded-[8px] object-contain"
                />
                {hasMultiple && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={tCommon("next")}
                    className="absolute right-1 z-10 h-9 w-9 rounded-full bg-background/90 text-foreground shadow-sm"
                    onClick={() => showAdjacent(1)}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                )}
              </div>
              {hasMultiple && (
                <p className="text-[11.5px] text-subtle">{lightboxIndex + 1} / {previewable.length}</p>
              )}
              {lightboxAttachment.description && (
                <p className="text-[13px] text-muted-foreground text-center max-w-lg">{lightboxAttachment.description}</p>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={`/api/attachments/${lightboxAttachment.id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("openFullSize")}
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-border rounded-[10px] bg-card">
          <Paperclip className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-[13px]">{t("noAttachments")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-[10px] overflow-hidden bg-card">
          {attachments.map((attachment) => {
            const isLink = attachment.attachmentType === "link";
            const isImage = !isLink && isPreviewableImage(attachment.mimeType);
            const isPdf = !isLink && attachment.mimeType === "application/pdf";
            const displayName = label(attachment);

            return (
              <div key={attachment.id} className="flex items-start gap-3 p-3 hover:bg-background transition-colors">
                {/* Thumbnail / icon */}
                {isImage ? (
                  <button
                    type="button"
                    className="flex-shrink-0 w-[52px] h-[52px] rounded-[7px] overflow-hidden border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group relative"
                    onClick={() => setLightboxId(attachment.id)}
                    aria-label={t("previewAlt", { name: displayName })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/attachments/${attachment.id}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </div>
                  </button>
                ) : isLink ? (
                  <div className="w-[52px] h-[52px] rounded-[7px] flex items-center justify-center flex-shrink-0 bg-[#f0fdf4]">
                    <Link2 className="h-5 w-5 text-green-600" />
                  </div>
                ) : isPdf ? (
                  <div className="w-[52px] h-[52px] rounded-[7px] flex items-center justify-center flex-shrink-0 bg-[#fef2f2]">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                ) : (
                  <div className="w-[52px] h-[52px] rounded-[7px] flex items-center justify-center flex-shrink-0 bg-muted">
                    <File className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                {/* Name + meta + description */}
                <div className="flex-1 min-w-0">
                  {isLink && attachment.url ? (
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-primary hover:underline truncate flex items-center gap-1"
                    >
                      {displayName}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                    </a>
                  ) : (
                    <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
                  )}
                  {/* Show originalName as subtitle if displayName overrides it */}
                  {attachment.displayName?.trim() && (
                    <p className="text-[11px] text-subtle truncate">{attachment.originalName}</p>
                  )}
                  <p className="text-[11.5px] text-muted-foreground">
                    {isLink ? t("linkType") : formatFileSize(attachment.size ?? 0)}
                    {" · "}
                    {t("addedBy", { date: formatDate(attachment.createdAt), name: attachment.uploadedBy.name })}
                  </p>
                  {attachment.description && (
                    <p className="text-[12px] text-muted-foreground mt-1 whitespace-pre-wrap break-words">{attachment.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0 pt-0.5">
                  {!isLink && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Download ${displayName}`}
                      className="h-[30px] w-[30px] text-muted-foreground hover:text-secondary-foreground"
                      onClick={() => window.open(`/api/attachments/${attachment.id}`, "_blank")}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t("editAttachment")} ${displayName}`}
                      className="h-[30px] w-[30px] text-muted-foreground hover:text-secondary-foreground"
                      onClick={() => openEdit(attachment)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${t(isLink ? "deleteLinkTitle" : "deleteConfirmTitle").replace("?", "")} ${displayName}`}
                          className="h-[30px] w-[30px] text-[#ef4444] hover:text-[#ef4444] hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{isLink ? t("deleteLinkTitle") : t("deleteConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            &quot;{displayName}&quot; will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(attachment.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {tCommon("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

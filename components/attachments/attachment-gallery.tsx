"use client";

import { useState, useRef, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/use-toast";
import { formatFileSize } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
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
} from "lucide-react";
import { apiFetch, apiErrorMessage } from "@/lib/api-client";
import { attachmentLabel, isPreviewableImage, type Attachment } from "@/components/attachments/attachment";
import { AddLinkDialog } from "@/components/attachments/add-link-dialog";
import { EditAttachmentDialog } from "@/components/attachments/edit-attachment-dialog";
import { AttachmentLightbox } from "@/components/attachments/attachment-lightbox";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

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
  const showApiError = useApiErrorToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const previewable = attachments.filter((a) => a.attachmentType !== "link" && isPreviewableImage(a.mimeType));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      if (locationId) formData.append("locationId", locationId);
      if (assetId) formData.append("assetId", assetId);
      const res = await apiFetch<Attachment>("/api/attachments", { method: "POST", body: formData });
      if (!res.ok) {
        toast({ title: t("uploadFailed"), description: apiErrorMessage(res.error, file.name), variant: "destructive" });
      } else {
        const attachment = res.data;
        onUpdate((current) => [attachment, ...current]);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    toast({ title: t("deleted") });
    onUpdate((current) => current.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div
          className={`border-2 border-dashed rounded-[10px] px-5 py-7 text-center transition-colors cursor-pointer bg-card ${
            dragOver ? "border-primary bg-primary-tint" : "border-input"
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
                {t.rich("dropFiles", { browse: (chunks) => <span className="text-primary hover:underline">{chunks}</span> })}
              </p>
              <p className="text-[11.5px] text-subtle">{t("allowedFilesHint")}</p>
            </div>
          )}
        </div>
      )}

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

      <AddLinkDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        locationId={locationId}
        assetId={assetId}
        onAdded={(attachment) => onUpdate((current) => [attachment, ...current])}
      />

      <EditAttachmentDialog
        attachment={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => onUpdate((current) => current.map((a) => (a.id === updated.id ? updated : a)))}
      />

      <AttachmentLightbox images={previewable} openId={lightboxId} onOpenIdChange={setLightboxId} />

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
            const displayName = attachmentLabel(attachment);

            return (
              <div key={attachment.id} className="flex items-start gap-3 p-3 hover:bg-background transition-colors">
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
                  <div className="w-[52px] h-[52px] rounded-[7px] flex items-center justify-center flex-shrink-0 bg-success-surface">
                    <Link2 className="h-5 w-5 text-success-foreground" />
                  </div>
                ) : isPdf ? (
                  <div className="w-[52px] h-[52px] rounded-[7px] flex items-center justify-center flex-shrink-0 bg-danger-surface">
                    <FileText className="h-5 w-5 text-destructive" />
                  </div>
                ) : (
                  <div className="w-[52px] h-[52px] rounded-[7px] flex items-center justify-center flex-shrink-0 bg-muted">
                    <File className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

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

                <div className="flex gap-1 flex-shrink-0 pt-0.5">
                  {!isLink && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("downloadNamed", { name: displayName })}
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
                      aria-label={t("editNamed", { name: displayName })}
                      className="h-[30px] w-[30px] text-muted-foreground hover:text-secondary-foreground"
                      onClick={() => setEditing(attachment)}
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
                          aria-label={t(isLink ? "deleteLinkNamed" : "deleteAttachmentNamed", { name: displayName })}
                          className="h-[30px] w-[30px] text-destructive hover:text-destructive hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{isLink ? t("deleteLinkTitle") : t("deleteConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteConfirmDescription", { name: displayName })}
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

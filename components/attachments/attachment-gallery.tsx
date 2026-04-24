"use client";

import { useState, useRef } from "react";
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
import { formatDate, formatFileSize } from "@/lib/utils";
import {
  FileImage,
  FileText,
  File,
  Trash2,
  Upload,
  Download,
  Loader2,
  Paperclip,
} from "lucide-react";

type Attachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date | string;
  uploadedBy: { id: string; name: string };
};

function FileIconBox({ mimeType }: { mimeType: string }) {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  return (
    <div
      className={`w-[34px] h-[34px] rounded-[7px] flex items-center justify-center flex-shrink-0 ${
        isImage ? "bg-[#eff6ff]" : isPdf ? "bg-[#fef2f2]" : "bg-[#f1f5f9]"
      }`}
    >
      {isImage ? (
        <FileImage className="h-4 w-4 text-blue-500" />
      ) : isPdf ? (
        <FileText className="h-4 w-4 text-red-500" />
      ) : (
        <File className="h-4 w-4 text-[#64748b]" />
      )}
    </div>
  );
}

export function AttachmentGallery({
  attachments: initialAttachments,
  locationId,
  assetId,
  canEdit,
  onUpdate,
}: {
  attachments: Attachment[];
  locationId?: string;
  assetId?: string;
  canEdit: boolean;
  onUpdate?: (attachments: Attachment[]) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function updateAttachments(next: Attachment[]) {
    setAttachments(next);
    onUpdate?.(next);
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
        const err = await res.json();
        toast({ title: "Upload failed", description: err.error || file.name, variant: "destructive" });
      } else {
        const attachment = await res.json();
        updateAttachments([attachment, ...attachments]);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Attachment deleted" });
    updateAttachments(attachments.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {canEdit && (
        <div
          className={`border-2 border-dashed rounded-[10px] px-5 py-7 text-center transition-colors cursor-pointer bg-white ${
            dragOver
              ? "border-[#1e64c8] bg-[#e8f0fc]"
              : "border-[#cbd5e1]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
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
            <div className="flex items-center justify-center gap-2 text-[#64748b]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[13px]">Uploading...</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Upload className="h-7 w-7 mx-auto text-[#94a3b8]" />
              <p className="text-[13px] text-[#64748b]">
                Drag &amp; drop files here, or{" "}
                <span className="text-[#1e64c8] hover:underline">browse</span>
              </p>
              <p className="text-[11.5px] text-[#94a3b8]">
                Images, PDF, Word, Excel, CSV — max 50 MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <div className="text-center py-8 text-[#64748b] border border-[#e2e8f0] rounded-[10px] bg-white">
          <Paperclip className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-[13px]">No attachments yet</p>
        </div>
      ) : (
        <div className="divide-y divide-[#e2e8f0]">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 py-[10px] first:pt-0"
            >
              <FileIconBox mimeType={attachment.mimeType} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#0f172a] truncate">{attachment.originalName}</p>
                <p className="text-[11.5px] text-[#64748b]">
                  {formatFileSize(attachment.size)} · Added {formatDate(attachment.createdAt)} by {attachment.uploadedBy.name}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-[30px] w-[30px] text-[#64748b] hover:text-[#334155]"
                  onClick={() => window.open(`/api/attachments/${attachment.id}`, "_blank")}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-[30px] w-[30px] text-[#ef4444] hover:text-[#ef4444] hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &quot;{attachment.originalName}&quot; will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(attachment.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

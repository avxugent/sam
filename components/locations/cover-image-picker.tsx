"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Check, ImageOff, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment as GalleryAttachment } from "@/components/attachments/attachment";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type Attachment = Pick<GalleryAttachment, "id" | "originalName" | "mimeType" | "size">;

type Props = {
  locationId: string;
  attachments: Attachment[];
  currentCoverImageId: string | null;
  onUpdate: (coverImageId: string | null) => void;
};

export function CoverImagePicker({
  locationId,
  attachments,
  currentCoverImageId,
  onUpdate,
}: Props) {
  const t = useTranslations("coverImage");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const [selected, setSelected] = useState<string | null>(currentCoverImageId);
  const [saving, setSaving] = useState(false);

  const imageAttachments = attachments.filter((a) => a.mimeType?.startsWith("image/"));

  async function handleSave(id: string | null) {
    setSaving(true);
    const res = await apiFetch(`/api/locations/${locationId}`, jsonBody("PUT", { coverImageId: id }));
    setSaving(false);

    if (!res.ok) {
      showApiError(res.error);
      return;
    }

    setSelected(id);
    onUpdate(id);
    toast({ title: t("saved") });
  }

  if (imageAttachments.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg p-4">
        <ImageOff className="h-4 w-4 flex-shrink-0" />
        <span>{t("noImages")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select an image attachment to use as the cover photo for this location.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {imageAttachments.map((attachment) => {
          const isSelected = selected === attachment.id;
          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => handleSave(isSelected ? null : attachment.id)}
              disabled={saving}
              className={cn(
                "relative rounded-lg overflow-hidden border-2 transition-all group aspect-video bg-muted",
                isSelected
                  ? "border-primary ring-2 ring-primary ring-offset-1"
                  : "border-transparent hover:border-muted-foreground/40"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/attachments/${attachment.id}`}
                alt={attachment.originalName}
                className="w-full h-full object-cover"
              />
              {isSelected && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <div className="bg-primary text-primary-foreground rounded-full p-1 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    <span className="text-xs pr-1">{t("currentCover")}</span>
                  </div>
                </div>
              )}
              {!isSelected && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                  <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">{t("useThis")}</span>
                </div>
              )}
              {saving && isSelected && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs truncate">{attachment.originalName}</p>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleSave(null)}
          disabled={saving}
          className="text-muted-foreground"
        >
          <Star className="h-3.5 w-3.5 mr-1.5" />
          {t("removeCover")}
        </Button>
      )}
    </div>
  );
}

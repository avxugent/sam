"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { attachmentLabel, type Attachment } from "@/components/attachments/attachment";

/**
 * Full-size preview of one image, open while `openId` names one of `images`;
 * previous/next buttons and the arrow keys cycle through them.
 */
export function AttachmentLightbox({
  images,
  openId,
  onOpenIdChange,
}: {
  images: Attachment[];
  openId: string | null;
  onOpenIdChange: (id: string | null) => void;
}) {
  const t = useTranslations("attachment");
  const tCommon = useTranslations("common");
  const index = images.findIndex((a) => a.id === openId);
  const current = index >= 0 ? images[index] : undefined;
  const hasMultiple = images.length > 1;

  function showAdjacent(delta: number) {
    if (index < 0 || images.length === 0) return;
    onOpenIdChange(images[(index + delta + images.length) % images.length].id);
  }

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") showAdjacent(1);
      else if (e.key === "ArrowLeft") showAdjacent(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, images.length]);

  return (
    <Dialog open={!!openId} onOpenChange={(v) => { if (!v) onOpenIdChange(null); }}>
      <DialogContent className="max-w-4xl p-2">
        <DialogHeader className="p-3 pb-0">
          <DialogTitle className="text-[14px] font-medium truncate">
            {current ? attachmentLabel(current) : ""}
          </DialogTitle>
        </DialogHeader>
        {current && (
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
                src={`/api/attachments/${current.id}`}
                alt={t("previewAlt", { name: attachmentLabel(current) })}
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
              <p className="text-[11.5px] text-subtle">{index + 1} / {images.length}</p>
            )}
            {current.description && (
              <p className="text-[13px] text-muted-foreground text-center max-w-lg">{current.description}</p>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={`/api/attachments/${current.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("openFullSize")}
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

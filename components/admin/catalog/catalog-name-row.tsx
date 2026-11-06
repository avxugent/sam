"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

/**
 * One row of a named catalog list (asset types, manufacturers): the name, which opens the asset
 * drilldown while assets use it, an inline rename, and a delete confirmation that is blocked while in use.
 * The rename draft lives here; the caller decides when the row leaves rename mode (`editing`).
 */
export function CatalogNameRow({
  name,
  assetCount,
  drilldownLabel,
  countLabel,
  onDrilldown,
  editing,
  onStartRename,
  onCancelRename,
  onSaveRename,
  deleteTitle,
  deleteDescription,
  onDelete,
  badges,
  extraActions,
}: {
  name: string;
  assetCount: number;
  /** Accessible name of the drilldown button. */
  drilldownLabel: string;
  /** Text of the asset-count badge. */
  countLabel: string;
  onDrilldown: () => void;
  editing: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (name: string) => void;
  deleteTitle: string;
  deleteDescription: string;
  onDelete: () => void;
  /** Extra badges after the asset count. */
  badges?: ReactNode;
  /** Extra buttons before rename. */
  extraActions?: ReactNode;
}) {
  const tCommon = useTranslations("common");

  if (editing) {
    return <RenameInput initialName={name} onSave={onSaveRename} onCancel={onCancelRename} />;
  }

  const inUse = assetCount > 0;
  return (
    <>
      {inUse ? (
        <button
          type="button"
          onClick={onDrilldown}
          className="flex-1 text-left text-sm font-medium cursor-pointer hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          aria-label={drilldownLabel}
        >
          {name}
        </button>
      ) : (
        <span className="flex-1 text-sm font-medium">{name}</span>
      )}
      {inUse && (
        <Badge
          variant="secondary"
          className="text-xs cursor-pointer hover:bg-secondary/80"
          onClick={onDrilldown}
          aria-hidden="true"
        >
          {countLabel}
        </Badge>
      )}
      {badges}
      {extraActions}
      <Button
        size="icon"
        variant="ghost"
        aria-label={tCommon("renameItem", { name })}
        className="h-8 w-8"
        onClick={onStartRename}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={tCommon("deleteItem", { name })} className="h-8 w-8 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={inUse}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Mounted when rename mode starts, so the draft always begins at the current name. */
function RenameInput({ initialName, onSave, onCancel }: { initialName: string; onSave: (name: string) => void; onCancel: () => void }) {
  const tCommon = useTranslations("common");
  const [draft, setDraft] = useState(initialName);
  return (
    <>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(draft);
          if (e.key === "Escape") onCancel();
        }}
        className="max-w-xs h-8"
        autoFocus
      />
      <Button size="icon" variant="ghost" aria-label={tCommon("saveName")} className="h-8 w-8" onClick={() => onSave(draft)}>
        <Check className="h-4 w-4 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" aria-label={tCommon("cancelRename")} className="h-8 w-8" onClick={onCancel}>
        <X className="h-4 w-4" />
      </Button>
    </>
  );
}

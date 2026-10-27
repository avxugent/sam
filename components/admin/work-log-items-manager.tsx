"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, Trash2, Check, X, Plus } from "lucide-react";

export type WorkLogItem = {
  id: string;
  name: string;
  description: string | null;
  _count: { workLogs: number };
};

const API = "/api/work-log-items";

export function WorkLogItemsManager({ initialItems }: { initialItems: WorkLogItem[] }) {
  const { toast } = useToast();
  const t = useTranslations("workLogItems");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState(initialItems);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null }),
    });
    setAdding(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const item = await res.json();
    setItems((prev) =>
      [...prev, { ...item, _count: { workLogs: 0 } }].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewName("");
    setNewDescription("");
    toast({ title: t("added") });
  }

  function startEdit(item: WorkLogItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description ?? "");
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    const res = await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, name: updated.name, description: updated.description } : i))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
    toast({ title: t("updated") });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`${API}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("deleted") });
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-2">
          <Input
            placeholder={t("namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-md"
          />
          <Textarea
            placeholder={t("descriptionPlaceholder")}
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="max-w-md text-sm"
          />
        </div>
        <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {tCommon("add")}
        </Button>
      </div>

      {/* List */}
      <div className="border rounded-lg divide-y">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("empty")}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="max-w-md h-8"
                    autoFocus
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="max-w-md text-sm"
                    placeholder={t("descriptionPlaceholder")}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => handleEdit(item.id)}>
                      <Check className="h-4 w-4 text-green-600" /> {tCommon("save")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" /> {tCommon("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      {item._count.workLogs > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {t("entryCount", { count: item._count.workLogs })}
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.description}</p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("editAriaLabel", { name: item.name })}
                    className="h-8 w-8"
                    onClick={() => startEdit(item)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("deleteAriaLabel", { name: item.name })}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteTitle", { name: item.name })}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {item._count.workLogs > 0
                            ? t("deleteUsed", { count: item._count.workLogs })
                            : t("deleteUnused")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(item.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {tCommon("delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

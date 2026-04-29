"use client";

import { useState, useEffect } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, Trash2, Check, X, Plus } from "lucide-react";

type Item = { id: string; name: string; _count: { assets: number } };

export function LookupListManager({
  initialItems,
  apiBase,
  entityName,
}: {
  initialItems: Item[];
  apiBase: string;
  entityName: string;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  useEffect(() => { setItems(initialItems); }, [initialItems]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setAdding(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    const item = await res.json();
    setItems((prev) => [...prev, { ...item, _count: { assets: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    toast({ title: `${entityName} added` });
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    const res = await fetch(`${apiBase}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, name: updated.name } : i)).sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
    toast({ title: `${entityName} updated` });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: `${entityName} deleted` });
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder={`Add new ${entityName.toLowerCase()}...`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="max-w-sm"
        />
        <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>

      {/* List */}
      <div className="border rounded-lg divide-y">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No {entityName.toLowerCase()}s yet
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEdit(item.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="max-w-xs h-8"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(item.id)}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{item.name}</span>
                  {item._count.assets > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {item._count.assets} asset{item._count.assets !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {item._count.assets > 0
                            ? `This ${entityName.toLowerCase()} is used by ${item._count.assets} asset(s). Reassign them before deleting.`
                            : `This will permanently delete this ${entityName.toLowerCase()}.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(item.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={item._count.assets > 0}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

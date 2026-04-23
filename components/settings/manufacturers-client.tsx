"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDate } from "@/lib/utils";

type Manufacturer = {
  id: string;
  name: string;
  _count: { assets: number };
};

type DrilldownAsset = {
  id: string;
  model?: string | null;
  serialNumber?: string | null;
  hostname?: string | null;
  installationDate?: string | null;
  location: { id: string; name: string } | null;
  type: { name: string } | null;
};

type MergeConflict = {
  editingId: string;
  newName: string;
  existingId: string;
  existingName: string;
  existingAssetCount: number;
};

export function ManufacturersClient({
  initialManufacturers,
}: {
  initialManufacturers: Manufacturer[];
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialManufacturers);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Drilldown dialog
  const [drilldownItem, setDrilldownItem] = useState<Manufacturer | null>(null);
  const [drilldownAssets, setDrilldownAssets] = useState<DrilldownAsset[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Merge conflict AlertDialog (programmatically controlled)
  const [mergeConflict, setMergeConflict] = useState<MergeConflict | null>(null);
  const [merging, setMerging] = useState(false);

  async function openDrilldown(item: Manufacturer) {
    setDrilldownItem(item);
    setDrilldownAssets([]);
    setDrilldownLoading(true);
    const res = await fetch(`/api/manufacturers/${item.id}/assets`);
    setDrilldownLoading(false);
    if (res.ok) {
      setDrilldownAssets(await res.json());
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/manufacturers", {
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
    setItems((prev) =>
      [...prev, { ...item, _count: { assets: 0 } }].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewName("");
    toast({ title: "Manufacturer added" });
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    const res = await fetch(`/api/manufacturers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });

    if (res.status === 409) {
      const err = await res.json();
      setMergeConflict({
        editingId: id,
        newName: editName.trim(),
        existingId: err.existingId,
        existingName: err.existingName,
        existingAssetCount: err.existingAssetCount ?? 0,
      });
      return;
    }

    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, name: updated.name } : i))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
    toast({ title: "Manufacturer updated" });
  }

  async function handleMerge() {
    if (!mergeConflict) return;
    setMerging(true);
    const res = await fetch(`/api/manufacturers/${mergeConflict.editingId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: mergeConflict.existingId }),
    });
    setMerging(false);

    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Error", description: data.error, variant: "destructive" });
      setMergeConflict(null);
      return;
    }

    setItems((prev) => prev.filter((i) => i.id !== mergeConflict.editingId));
    setMergeConflict(null);
    setEditingId(null);
    toast({
      title: "Manufacturers merged",
      description: `${data.movedCount} asset(s) moved to "${mergeConflict.existingName}".`,
    });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/manufacturers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Manufacturer deleted" });
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder="Add new manufacturer..."
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
          <div className="text-center py-8 text-muted-foreground">No manufacturers yet</div>
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
                  <span
                    className={`flex-1 text-sm font-medium ${item._count.assets > 0 ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                    onClick={() => item._count.assets > 0 && openDrilldown(item)}
                    title={item._count.assets > 0 ? `View ${item._count.assets} asset(s)` : undefined}
                  >
                    {item.name}
                  </span>
                  {item._count.assets > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs cursor-pointer hover:bg-secondary/80"
                      onClick={() => openDrilldown(item)}
                    >
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
                            ? `This manufacturer is used by ${item._count.assets} asset(s). Reassign them before deleting.`
                            : "This will permanently delete this manufacturer."}
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

      {/* Asset drilldown dialog */}
      <Dialog
        open={!!drilldownItem}
        onOpenChange={(open) => { if (!open) setDrilldownItem(null); }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {drilldownItem?.name}
              {!drilldownLoading && (
                <span className="font-normal text-muted-foreground ml-2">
                  — {drilldownAssets.length} asset{drilldownAssets.length !== 1 ? "s" : ""}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {drilldownLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Location</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Model</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Serial #</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Hostname</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Installed</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownAssets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">No assets found</td>
                    </tr>
                  ) : (
                    drilldownAssets.map((asset, i) => (
                      <tr
                        key={asset.id}
                        className={`border-b last:border-0 hover:bg-muted/30 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}
                      >
                        <td className="px-3 py-2">
                          {asset.location ? (
                            <Link href={`/locations/${asset.location.id}`} className="hover:text-primary">
                              {asset.location.name}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {asset.type ? (
                            <Badge variant="outline" className="text-xs">{asset.type.name}</Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 font-medium">{asset.model || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{asset.serialNumber || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{asset.hostname || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(asset.installationDate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge conflict dialog (programmatically opened) */}
      <AlertDialog open={!!mergeConflict} onOpenChange={(open) => { if (!open) setMergeConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manufacturer already exists</AlertDialogTitle>
            <AlertDialogDescription>
              A manufacturer named &quot;{mergeConflict?.existingName}&quot; already exists
              {mergeConflict?.existingAssetCount
                ? ` with ${mergeConflict.existingAssetCount} asset(s)`
                : ""}. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMergeConflict(null)}>
              Change name
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={merging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move all assets &amp; merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

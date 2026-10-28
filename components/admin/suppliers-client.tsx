"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
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
import { Plus, Loader2, Trash2, ChevronDown, ChevronUp, Save } from "lucide-react";
import { apiErrorMessage, formatDate, toIsoDay } from "@/lib/utils";
import { apiFetch, jsonBody } from "@/lib/api-client";

export type SupplierRow = {
  id: string;
  name: string;
  contractReference: string | null;
  contactInfo: string | null;
  defaultFrom: Date | string | null;
  defaultUntil: Date | string | null;
  _count: { assets: number };
};

function toDateInput(d: Date | string | null): string {
  if (!d) return "";
  return toIsoDay(d);
}

export function SuppliersClient({ initialSuppliers }: { initialSuppliers: SupplierRow[] }) {
  const t = useTranslations("suppliers");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    contractReference: string;
    contactInfo: string;
    defaultFrom: string;
    defaultUntil: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  /** Localized text for the window-overlap conflict; anything else via apiErrorMessage. */
  function describeError(err: { error?: string; code?: string; details?: unknown }): string {
    if (err.code === "supplierWindowOverlap" && Array.isArray(err.details)) {
      return t("windowOverlap", { names: err.details.join(", ") });
    }
    return apiErrorMessage(err, tCommon("error"));
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await apiFetch<SupplierRow>("/api/suppliers", jsonBody("POST", { name: newName.trim() }));
    setAdding(false);
    if (!res.ok) {
      toast({ title: tCommon("error"), description: describeError(res.error), variant: "destructive" });
      return;
    }
    const created = res.data;
    setSuppliers((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewName("");
    toast({ title: t("created") });
  }

  function toggleExpand(supplier: SupplierRow) {
    if (expandedId === supplier.id) {
      setExpandedId(null);
      setDraft(null);
      return;
    }
    setExpandedId(supplier.id);
    setDraft({
      name: supplier.name,
      contractReference: supplier.contractReference ?? "",
      contactInfo: supplier.contactInfo ?? "",
      defaultFrom: toDateInput(supplier.defaultFrom),
      defaultUntil: toDateInput(supplier.defaultUntil),
    });
  }

  async function handleSave(id: string) {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    const res = await apiFetch<Partial<SupplierRow>>(
      `/api/suppliers/${id}`,
      jsonBody("PUT", {
        name: draft.name.trim(),
        contractReference: draft.contractReference.trim() || null,
        contactInfo: draft.contactInfo.trim() || null,
        defaultFrom: draft.defaultFrom || null,
        defaultUntil: draft.defaultUntil || null,
      })
    );
    setSaving(false);
    if (!res.ok) {
      toast({ title: tCommon("error"), description: describeError(res.error), variant: "destructive" });
      return;
    }
    const updated = res.data;
    setSuppliers((prev) =>
      prev
        .map((s) => (s.id === id ? { ...s, ...updated } : s))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setExpandedId(null);
    setDraft(null);
    toast({ title: t("updated") });
    router.refresh();
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    toast({ title: t("deleted") });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder={t("namePlaceholder")}
          className="max-w-xs"
        />
        <Button onClick={handleAdd} disabled={adding || !newName.trim()} className="gap-1">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("addSupplier")}
        </Button>
      </div>

      <div className="border border-border rounded-[10px] overflow-x-auto bg-card">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-background text-left text-[12px] text-muted-foreground">
              <th scope="col" className="px-4 py-[10px] font-medium">{t("name")}</th>
              <th scope="col" className="px-4 py-[10px] font-medium">{t("contractReference")}</th>
              <th scope="col" className="px-4 py-[10px] font-medium">{t("defaultWindow")}</th>
              <th scope="col" className="px-4 py-[10px] font-medium text-right">{t("assets")}</th>
              <th scope="col" className="px-4 py-[10px] font-medium text-right">{tCommon("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">{t("empty")}</td>
              </tr>
            )}
            {suppliers.map((supplier) => (
              <>
                <tr key={supplier.id} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-4 py-[10px] font-medium text-foreground">{supplier.name}</td>
                  <td className="px-4 py-[10px] text-muted-foreground">{supplier.contractReference ?? "—"}</td>
                  <td className="px-4 py-[10px] text-muted-foreground text-[12px]">
                    {supplier.defaultFrom
                      ? `${formatDate(supplier.defaultFrom)} → ${supplier.defaultUntil ? formatDate(supplier.defaultUntil) : t("openEnded")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-[10px] text-right text-muted-foreground">{supplier._count.assets}</td>
                  <td className="px-4 py-[10px]">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("edit")}
                        className="h-[30px] w-[30px] border border-border rounded-md bg-background hover:bg-card"
                        onClick={() => toggleExpand(supplier)}
                      >
                        {expandedId === supplier.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={tCommon("delete")}
                            disabled={supplier._count.assets > 0}
                            className="h-[30px] w-[30px] border border-border rounded-md bg-background hover:bg-card text-[#dc2626] disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("deleteConfirmDescription")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(supplier.id)}>
                              {tCommon("delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
                {expandedId === supplier.id && draft && (
                  <tr key={`${supplier.id}-edit`} className="border-b border-border bg-background">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                        <div className="space-y-1.5">
                          <Label htmlFor={`sup-name-${supplier.id}`}>{t("name")}</Label>
                          <Input
                            id={`sup-name-${supplier.id}`}
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`sup-contract-${supplier.id}`}>{t("contractReference")}</Label>
                          <Input
                            id={`sup-contract-${supplier.id}`}
                            value={draft.contractReference}
                            onChange={(e) => setDraft({ ...draft, contractReference: e.target.value })}
                            placeholder={t("contractPlaceholder")}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={`sup-contact-${supplier.id}`}>{t("contactInfo")}</Label>
                          <Textarea
                            id={`sup-contact-${supplier.id}`}
                            value={draft.contactInfo}
                            onChange={(e) => setDraft({ ...draft, contactInfo: e.target.value })}
                            rows={2}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`sup-from-${supplier.id}`}>{t("defaultFrom")}</Label>
                          <Input
                            id={`sup-from-${supplier.id}`}
                            type="date"
                            value={draft.defaultFrom}
                            onChange={(e) => setDraft({ ...draft, defaultFrom: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`sup-until-${supplier.id}`}>{t("defaultUntil")}</Label>
                          <Input
                            id={`sup-until-${supplier.id}`}
                            type="date"
                            value={draft.defaultUntil}
                            onChange={(e) => setDraft({ ...draft, defaultUntil: e.target.value })}
                          />
                        </div>
                        <p className="text-[12px] text-muted-foreground sm:col-span-2">{t("windowHelp")}</p>
                        <div className="sm:col-span-2 flex justify-end gap-2">
                          <Button variant="outline" onClick={() => { setExpandedId(null); setDraft(null); }}>
                            {tCommon("cancel")}
                          </Button>
                          <Button onClick={() => handleSave(supplier.id)} disabled={saving || !draft.name.trim()} className="gap-1">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {tCommon("save")}
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

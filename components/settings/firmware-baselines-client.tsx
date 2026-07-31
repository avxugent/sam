"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, Check, X } from "lucide-react";

export type FirmwareBaselineRow = {
  id: string;
  model: string | null;
  approvedVersion: string;
  notes: string | null;
  type: { id: string; name: string };
};

export type ObservedGroup = {
  typeId: string;
  typeName: string;
  model: string | null;
  assetCount: number;
  versions: { version: string; count: number }[];
  suggestedVersion: string | null;
  coveredBy: { model: string | null; approvedVersion: string } | null;
};

export function FirmwareBaselinesClient({
  baselines,
  observed,
  assetTypes,
}: {
  baselines: FirmwareBaselineRow[];
  observed: ObservedGroup[];
  assetTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState("");

  const [newTypeId, setNewTypeId] = useState(assetTypes[0]?.id ?? "");
  const [newModel, setNewModel] = useState("");
  const [newVersion, setNewVersion] = useState("");

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    setBusy(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error ?? "Request failed", variant: "destructive" });
      return false;
    }
    router.refresh();
    return true;
  }

  async function create(typeId: string, model: string | null, approvedVersion: string, key: string) {
    if (!approvedVersion.trim()) {
      toast({ title: "Error", description: "Approved version is required.", variant: "destructive" });
      return;
    }
    const ok = await call(
      "/api/firmware-baselines",
      { method: "POST", body: JSON.stringify({ typeId, model, approvedVersion }) },
      key
    );
    if (ok) {
      setNewModel("");
      setNewVersion("");
      toast({ title: "Baseline created" });
    }
  }

  return (
    <div className="space-y-8">
      {/* ── What is deployed ───────────────────────────────────────────────── */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Firmware in the field</h2>
          <p className="text-[13px] text-[#64748b] mt-1">
            Versions reported by devices, grouped by asset type and model. Only devices with an API
            appear here — the rest can never report a version and stay unmeasured.
          </p>
        </div>

        {observed.length === 0 ? (
          <p className="text-[13px] text-[#64748b]">
            No device has reported a firmware version yet. Run{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">npm run assets:sync-firmware</code>{" "}
            once the exporters are emitting <code className="font-mono bg-[#f1f5f9] px-1 rounded">device_firmware_info</code>.
          </p>
        ) : (
          <div className="border border-[#e2e8f0] rounded-[8px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8fafc] text-[#64748b]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-left font-medium px-3 py-2">Model</th>
                  <th className="text-right font-medium px-3 py-2">Devices</th>
                  <th className="text-left font-medium px-3 py-2">Versions seen</th>
                  <th className="text-left font-medium px-3 py-2">Baseline</th>
                </tr>
              </thead>
              <tbody>
                {observed.map((g) => {
                  const key = `${g.typeId}:${g.model ?? ""}`;
                  return (
                    <tr key={key} className="border-t border-[#e2e8f0]">
                      <td className="px-3 py-2">{g.typeName}</td>
                      <td className="px-3 py-2 text-[#64748b]">{g.model ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{g.assetCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {g.versions.map((v) => (
                            <span
                              key={v.version}
                              className="font-mono text-[11px] bg-[#f1f5f9] px-1.5 py-[1px] rounded"
                              title={`${v.count} device(s)`}
                            >
                              {v.version} ×{v.count}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {g.coveredBy ? (
                          <span className="inline-flex items-center gap-1 text-[#166534]">
                            <Check className="h-3.5 w-3.5" />
                            <span className="font-mono text-[12px]">{g.coveredBy.approvedVersion}</span>
                            {g.coveredBy.model === null && (
                              <span className="text-[#64748b] text-[11px]">(type-wide)</span>
                            )}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === key || !g.suggestedVersion}
                            onClick={() => create(g.typeId, g.model, g.suggestedVersion ?? "", key)}
                            className="h-7 gap-1 text-[12px]"
                            title={
                              g.suggestedVersion
                                ? `Create a baseline at ${g.suggestedVersion}, the highest version seen`
                                : "No version here could be ordered, so there is nothing to suggest"
                            }
                          >
                            {busy === key ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            Set {g.suggestedVersion ?? "—"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Configured baselines ───────────────────────────────────────────── */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Approved versions</h2>
          <p className="text-[13px] text-[#64748b] mt-1">
            A device is up to date when its version is at or above the baseline. A row naming a model
            wins over the type-wide row. Assets with no matching row are reported as{" "}
            <em>unclassified</em> — never as compliant.
          </p>
        </div>

        {baselines.length > 0 && (
          <div className="border border-[#e2e8f0] rounded-[8px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8fafc] text-[#64748b]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-left font-medium px-3 py-2">Model</th>
                  <th className="text-left font-medium px-3 py-2">Approved version</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {baselines.map((b) => (
                  <tr key={b.id} className="border-t border-[#e2e8f0]">
                    <td className="px-3 py-2">{b.type.name}</td>
                    <td className="px-3 py-2 text-[#64748b]">{b.model ?? "all models"}</td>
                    <td className="px-3 py-2">
                      {editing === b.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editVersion}
                            onChange={(e) => setEditVersion(e.target.value)}
                            className="h-7 font-mono text-[12px] w-40"
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={busy === b.id}
                            onClick={async () => {
                              const ok = await call(
                                `/api/firmware-baselines/${b.id}`,
                                { method: "PATCH", body: JSON.stringify({ approvedVersion: editVersion }) },
                                b.id
                              );
                              if (ok) setEditing(null);
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditing(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="font-mono text-[12px] hover:underline"
                          onClick={() => {
                            setEditing(b.id);
                            setEditVersion(b.approvedVersion);
                          }}
                        >
                          {b.approvedVersion}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-[#dc2626]"
                        disabled={busy === b.id}
                        onClick={() =>
                          call(`/api/firmware-baselines/${b.id}`, { method: "DELETE" }, b.id)
                        }
                        title="Delete — every matching asset returns to unclassified"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="fb-type">Asset type</Label>
            <select
              id="fb-type"
              value={newTypeId}
              onChange={(e) => setNewTypeId(e.target.value)}
              className="h-9 rounded-[6px] border border-[#e2e8f0] px-2 text-[13px] bg-white"
            >
              {assetTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fb-model">Model</Label>
            <Input
              id="fb-model"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="blank = all models"
              className="h-9 text-[13px] w-52"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fb-version">Approved version</Label>
            <Input
              id="fb-version"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="4.18.1"
              className="h-9 font-mono text-[13px] w-40"
            />
          </div>
          <Button
            disabled={busy === "new" || !newTypeId}
            onClick={() => create(newTypeId, newModel || null, newVersion, "new")}
            className="gap-2 h-9"
          >
            {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </section>
    </div>
  );
}

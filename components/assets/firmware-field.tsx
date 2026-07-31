"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, X, Pencil } from "lucide-react";

/**
 * Firmware version on the asset detail page, with attestation.
 *
 * Devices with an API report their version through the exporters and this is
 * read-only for them — the next sync would overwrite anything typed here. For
 * the many AV devices with no API, a person records what they saw, which is the
 * only way those assets ever leave "no version reported".
 *
 * An attestation ages like any other evidence: it stamps the check time, so it
 * becomes stale once past the configured validity window and someone has to look
 * again. A one-off entry that counted forever would be worse than none.
 */
export function FirmwareField({
  assetId,
  version,
  source,
  checkedAt,
  attestedByName,
  canEdit,
}: {
  assetId: string;
  version: string | null;
  source: "REPORTED" | "ATTESTED" | null;
  checkedAt: Date | string | null;
  attestedByName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version ?? "");
  const [busy, setBusy] = useState(false);

  const reported = source === "REPORTED";

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/assets/${assetId}/firmware`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: draft }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error ?? "Failed", variant: "destructive" });
      return;
    }
    setEditing(false);
    router.refresh();
    toast({ title: "Firmware version recorded" });
  }

  async function clear() {
    setBusy(true);
    const res = await fetch(`/api/assets/${assetId}/firmware`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error ?? "Failed", variant: "destructive" });
      return;
    }
    setEditing(false);
    setDraft("");
    router.refresh();
  }

  if (editing) {
    return (
      <dd className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="4.18.1"
          className="h-7 font-mono text-[12px] w-32"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
        {source === "ATTESTED" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-[#dc2626]"
            disabled={busy}
            onClick={clear}
          >
            Clear
          </Button>
        )}
      </dd>
    );
  }

  return (
    <dd className="text-[13px]">
      {version ? (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[12px]">{version}</span>
          <span
            className={
              reported
                ? "text-[10px] uppercase tracking-wide text-[#166534] bg-[#dcfce7] px-1.5 py-[1px] rounded"
                : "text-[10px] uppercase tracking-wide text-[#92400e] bg-[#fef3c7] px-1.5 py-[1px] rounded"
            }
            title={
              reported
                ? "Read from the device by an exporter"
                : `Recorded by ${attestedByName ?? "a user"}`
            }
          >
            {reported ? "reported" : "attested"}
          </span>
          {checkedAt && (
            <span className="text-[11px] text-[#64748b]">
              {new Date(checkedAt).toISOString().split("T")[0]}
            </span>
          )}
        </span>
      ) : (
        <span className="text-[#94a3b8] text-[13px]">not reported</span>
      )}

      {canEdit && !reported && (
        <button
          onClick={() => {
            setDraft(version ?? "");
            setEditing(true);
          }}
          className="ml-2 text-[#1e64c8] hover:underline text-[11px] inline-flex items-center gap-0.5"
          title="This device has no API to ask, so its version is recorded by hand"
        >
          <Pencil className="h-3 w-3" />
          {version ? "update" : "record"}
        </button>
      )}
    </dd>
  );
}

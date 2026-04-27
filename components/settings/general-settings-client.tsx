"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, ExternalLink } from "lucide-react";

export function GeneralSettingsClient({
  initialHostnameUrlTemplate,
}: {
  initialHostnameUrlTemplate: string;
}) {
  const { toast } = useToast();
  const [hostnameUrlTemplate, setHostnameUrlTemplate] = useState(initialHostnameUrlTemplate);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/general", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostnameUrlTemplate }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Settings saved" });
  }

  const previewUrl = hostnameUrlTemplate
    ? hostnameUrlTemplate
        .replaceAll("{hostname}", "pc-example-01")
        .replaceAll("{serial}", "SN123456")
        .replaceAll("{model}", "OptiPlex 7090")
        .replaceAll("{manufacturer}", "Dell")
    : "";

  return (
    <div className="space-y-8">
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Hostname URL template</h2>
          <p className="text-[13px] text-[#64748b] mt-1">
            When set, hostnames in the asset list and detail page become clickable links.
            Leave empty to disable.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hostname-template">URL template</Label>
          <Input
            id="hostname-template"
            value={hostnameUrlTemplate}
            onChange={(e) => setHostnameUrlTemplate(e.target.value)}
            placeholder="https://example.com/host/{hostname}"
            className="font-mono text-[13px]"
          />
          <p className="text-[12px] text-[#64748b]">
            Available variables: <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{hostname}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{serial}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{model}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{manufacturer}"}</code>
          </p>
        </div>

        {previewUrl && (
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] text-[12px]">
            <p className="text-[#64748b] mb-1 font-medium">Preview (with example values):</p>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1e64c8] hover:underline font-mono inline-flex items-center gap-1"
            >
              {previewUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </Button>
        </div>
      </section>
    </div>
  );
}

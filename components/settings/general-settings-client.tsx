"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, ExternalLink } from "lucide-react";
import { renderMacAddressUrl } from "@/lib/hostname-template";

export function GeneralSettingsClient({
  initialHostnameUrlTemplate,
  initialMacAddressUrlTemplate,
}: {
  initialHostnameUrlTemplate: string;
  initialMacAddressUrlTemplate: string;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [hostnameUrlTemplate, setHostnameUrlTemplate] = useState(initialHostnameUrlTemplate);
  const [macAddressUrlTemplate, setMacAddressUrlTemplate] = useState(initialMacAddressUrlTemplate);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/general", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostnameUrlTemplate, macAddressUrlTemplate }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: t("saved") });
  }

  const hostnamePreview = hostnameUrlTemplate
    ? hostnameUrlTemplate
        .replaceAll("{hostname}", "pc-example-01")
        .replaceAll("{serial}", "SN123456")
        .replaceAll("{model}", "OptiPlex 7090")
        .replaceAll("{manufacturer}", "Dell")
    : "";

  const macPreview = macAddressUrlTemplate
    ? renderMacAddressUrl(macAddressUrlTemplate, "aa:bb:cc:dd:ee:ff")
    : "";

  return (
    <div className="space-y-8">
      {/* Hostname URL template */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">{t("hostnameTemplate")}</h2>
          <p className="text-[13px] text-[#64748b] mt-1">{t("hostnameTemplateHelp")}</p>
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
            Available variables:{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{hostname}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{serial}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{model}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{manufacturer}"}</code>
          </p>
        </div>

        {hostnamePreview && (
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] text-[12px]">
            <p className="text-[#64748b] mb-1 font-medium">Preview (with example values):</p>
            <a
              href={hostnamePreview}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1e64c8] hover:underline font-mono inline-flex items-center gap-1"
            >
              {hostnamePreview}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </section>

      {/* MAC address URL template */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">{t("macAddressTemplate")}</h2>
          <p className="text-[13px] text-[#64748b] mt-1">{t("macAddressTemplateHelp")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mac-template">URL template</Label>
          <Input
            id="mac-template"
            value={macAddressUrlTemplate}
            onChange={(e) => setMacAddressUrlTemplate(e.target.value)}
            placeholder="https://example.com/mac/{mac}"
            className="font-mono text-[13px]"
          />
          <p className="text-[12px] text-[#64748b]">
            Available variables:{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{mac}"}</code>{" "}
            <span className="text-[#94a3b8]">(aa:bb:cc:dd:ee:ff)</span>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{mac_plain}"}</code>{" "}
            <span className="text-[#94a3b8]">(aabbccddeeff)</span>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{mac_dash}"}</code>{" "}
            <span className="text-[#94a3b8]">(aa-bb-cc-dd-ee-ff)</span>
          </p>
        </div>

        {macPreview && (
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] text-[12px]">
            <p className="text-[#64748b] mb-1 font-medium">Preview (with example value aa:bb:cc:dd:ee:ff):</p>
            <a
              href={macPreview}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1e64c8] hover:underline font-mono inline-flex items-center gap-1"
            >
              {macPreview}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </div>
  );
}

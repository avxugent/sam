"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, ExternalLink } from "lucide-react";
import { renderLocationUrl, renderMacAddressUrl } from "@/lib/url-templates";
import { apiErrorMessage } from "@/lib/utils";

export function GeneralSettingsClient({
  initialHostnameUrlTemplate,
  initialMacAddressUrlTemplate,
  initialLocationUrlTemplate,
}: {
  initialHostnameUrlTemplate: string;
  initialMacAddressUrlTemplate: string;
  initialLocationUrlTemplate: string;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [hostnameUrlTemplate, setHostnameUrlTemplate] = useState(initialHostnameUrlTemplate);
  const [macAddressUrlTemplate, setMacAddressUrlTemplate] = useState(initialMacAddressUrlTemplate);
  const [locationUrlTemplate, setLocationUrlTemplate] = useState(initialLocationUrlTemplate);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/general", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostnameUrlTemplate, macAddressUrlTemplate, locationUrlTemplate }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
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

  const locationPreview = locationUrlTemplate
    ? renderLocationUrl(locationUrlTemplate, {
        fiNumber: "14.10.100.013",
        name: "Room 013",
        id: "clx0example000",
      })
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

      {/* Location URL template */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">{t("locationTemplate")}</h2>
          <p className="text-[13px] text-[#64748b] mt-1">{t("locationTemplateHelp")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location-template">URL template</Label>
          <Input
            id="location-template"
            value={locationUrlTemplate}
            onChange={(e) => setLocationUrlTemplate(e.target.value)}
            placeholder="https://grafana.example.com/d/sam-room/room?var-fi_number={fi_number}"
            className="font-mono text-[13px]"
          />
          <p className="text-[12px] text-[#64748b]">
            Available variables:{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{fi_number}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{location_name}"}</code>{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{location_id}"}</code>
          </p>
          <p className="text-[12px] text-[#64748b]">
            Locations without an FI number show no link when the template uses{" "}
            <code className="font-mono bg-[#f1f5f9] px-1 rounded">{"{fi_number}"}</code>.
          </p>
        </div>

        {locationPreview && (
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] text-[12px]">
            <p className="text-[#64748b] mb-1 font-medium">Preview (with example values):</p>
            <a
              href={locationPreview}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1e64c8] hover:underline font-mono inline-flex items-center gap-1"
            >
              {locationPreview}
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

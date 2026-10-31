"use client";

import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { getUsedVariables, validateTemplate } from "@/lib/prometheus/scrape-template";

export const TEMPLATE_PLACEHOLDER = `# Lines starting with # are comments.
# Format: key=value (one per line)
# Available variables: {hostname_fqdn}, {serial}, {model}, {manufacturer}, {fi_number}, {vault_path}
# {vault_path} is the asset's Vault path reference — the exporter reads the secret itself.

# Pearl recorder exporter example:
# __address__=https://pearlexporterdev.ugent.be
# __metrics_path__=/probe
# __param_target=https://{hostname_fqdn}
# __param_vault_path={vault_path}`;

export function TemplatePreview({ template }: { template: string }) {
  const t = useTranslations("scrapeTemplate");
  if (!template.trim()) return null;
  const errors = validateTemplate(template);
  const standard = getUsedVariables(template);

  return (
    <div className="space-y-2 mt-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
              <X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {e}
            </p>
          ))}
        </div>
      )}
      {errors.length === 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-start gap-2">
          <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-700">{t("syntaxValid")}</p>
        </div>
      )}
      {standard.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {standard.map((v) => (
            <code key={v} className="bg-muted px-1.5 py-0.5 rounded">
              {"{" + v + "}"}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

/** Help box + textarea + live preview, shared by the default-template and
 * per-manufacturer override editors. */
export function ScrapeTemplateFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("scrapeTemplate");
  const code = (chunks: React.ReactNode) => <code className="bg-muted px-1 rounded">{chunks}</code>;
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground">{t("formatTitle")}</p>
        <p>{t.rich("formatHelp", { code })}</p>
        <p className="font-medium text-foreground mt-1">{t("variablesTitle")}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {[
            ["{hostname_fqdn}", t("varHostname")],
            ["{serial}", t("varSerial")],
            ["{model}", t("varModel")],
            ["{manufacturer}", t("varManufacturer")],
            ["{fi_number}", t("varFiNumber")],
            ["{vault_path}", t("varVaultPath")],
          ].map(([v, desc]) => (
            <div key={v} className="flex items-baseline gap-1.5">
              <code className="text-blue-700 bg-blue-50 px-1 rounded shrink-0">{v}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs">
          <span className="font-medium text-foreground">{t("exampleLabel")}</span>{" "}
          <code className="bg-muted px-1 rounded">__address__=https://pearlexporter.example.com</code>{" "}
          <code className="bg-muted px-1 rounded">__metrics_path__=/probe</code>{" "}
          <code className="bg-muted px-1 rounded">__param_target=https://&#123;hostname_fqdn&#125;</code>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={TEMPLATE_PLACEHOLDER}
          rows={10}
          className="font-mono text-xs"
          spellCheck={false}
        />
        <TemplatePreview template={value} />
      </div>
    </div>
  );
}

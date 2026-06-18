/**
 * Prometheus scrape target template rendering engine.
 *
 * Template format: newline-separated key=value pairs where the key is a
 * Prometheus special label (e.g. __address__, __metrics_path__, __param_*).
 *
 * Supported substitution variables in values:
 *   {hostname_fqdn}   — asset.hostname verbatim
 *   {serial}          — asset.serialNumber
 *   {model}           — asset.model
 *   {manufacturer}    — manufacturer name
 *   {fi_number}       — location FI number (deepest in ancestor chain)
 *   {vault_path}      — asset.vaultPath (a non-secret reference, NOT the secret)
 *
 * Credentials are never rendered into the template. The SD output carries only
 * the {vault_path} reference; the external exporter reads the secret from Vault
 * itself and uses it to scrape the device.
 *
 * Example template (Pearl recorder exporter):
 *   __address__=https://pearlexporterdev.ugent.be
 *   __metrics_path__=/probe
 *   __param_target__=https://{hostname_fqdn}
 *   __param_vault_path__={vault_path}
 */

export type TemplateVars = {
  hostname_fqdn: string;
  serial: string;
  model: string;
  manufacturer: string;
  fi_number: string;
  vault_path: string;
};

/**
 * Substitutes all known variables into a single value string.
 * Unknown {placeholders} are left as-is.
 */
function substituteValue(value: string, vars: TemplateVars): string {
  return value
    .replace(/\{hostname_fqdn\}/g, vars.hostname_fqdn)
    .replace(/\{serial\}/g, vars.serial)
    .replace(/\{model\}/g, vars.model)
    .replace(/\{manufacturer\}/g, vars.manufacturer)
    .replace(/\{fi_number\}/g, vars.fi_number)
    .replace(/\{vault_path\}/g, vars.vault_path);
}

export type RenderedTemplate = {
  /** The rendered __label__: value map */
  labels: Record<string, string>;
};

/**
 * Parses and renders a scrape target template into a Prometheus label map.
 *
 * Blank lines and lines without "=" are silently ignored.
 * Lines starting with "#" are treated as comments.
 *
 * @param template   The raw template string stored on the AssetType
 * @param vars       Asset field values for substitution
 */
export function renderScrapeTemplate(
  template: string,
  vars: TemplateVars
): RenderedTemplate {
  const labels: Record<string, string> = {};

  for (const rawLine of template.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1); // do NOT trim — value may be a URL

    if (!key) continue;

    labels[key] = substituteValue(rawValue, vars);
  }

  return { labels };
}

/**
 * Validates a template string and returns a list of any structural errors.
 * Used by the UI to give immediate feedback when editing.
 */
export function validateTemplate(template: string): string[] {
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (const [lineNo, rawLine] of template.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      errors.push(`Line ${lineNo + 1}: Missing "=" separator — "${line}"`);
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    if (!key) {
      errors.push(`Line ${lineNo + 1}: Empty key`);
      continue;
    }

    if (seenKeys.has(key)) {
      errors.push(`Line ${lineNo + 1}: Duplicate key "${key}"`);
    }
    seenKeys.add(key);
  }

  return errors;
}

/** Returns the set of variable names used in the template (for the UI preview). */
export function getUsedVariables(template: string): {
  standard: string[];
} {
  const standard = new Set<string>();

  const standardPlaceholders = [
    "hostname_fqdn",
    "serial",
    "model",
    "manufacturer",
    "fi_number",
    "vault_path",
  ];

  for (const ph of standardPlaceholders) {
    if (template.includes(`{${ph}}`)) standard.add(ph);
  }

  return { standard: Array.from(standard) };
}

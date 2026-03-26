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
 *   {vault_<key>}     — value of <key> from the Vault secret at asset.vaultPath
 *
 * Example template (Pearl recorder exporter):
 *   __address__=https://pearlexporterdev.ugent.be
 *   __metrics_path__=/probe
 *   __param_target__=https://{hostname_fqdn}
 *   __param_user__={vault_username}
 *   __param_password__={vault_password}
 */

export type TemplateVars = {
  hostname_fqdn: string;
  serial: string;
  model: string;
  manufacturer: string;
  fi_number: string;
};

/**
 * Returns all {vault_<key>} placeholder names found in a template string.
 * Used to determine whether Vault lookups are needed before rendering.
 */
export function getVaultPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{vault_([^}]+)\}/g);
  const keys = new Set<string>();
  for (const m of matches) keys.add(m[1]);
  return Array.from(keys);
}

/**
 * Returns true if the template string contains any {vault_*} placeholders.
 */
export function templateNeedsVault(template: string): boolean {
  return /\{vault_[^}]+\}/.test(template);
}

/**
 * Substitutes all known variables into a single value string.
 * Unknown {placeholders} are left as-is if not found in either
 * vars or vaultSecrets.
 */
function substituteValue(
  value: string,
  vars: TemplateVars,
  vaultSecrets: Record<string, string> | null
): string {
  return value
    .replace(/\{hostname_fqdn\}/g, vars.hostname_fqdn)
    .replace(/\{serial\}/g, vars.serial)
    .replace(/\{model\}/g, vars.model)
    .replace(/\{manufacturer\}/g, vars.manufacturer)
    .replace(/\{fi_number\}/g, vars.fi_number)
    .replace(/\{vault_([^}]+)\}/g, (_match, key: string) => {
      return vaultSecrets?.[key] ?? "";
    });
}

export type RenderedTemplate = {
  /** The rendered __label__: value map */
  labels: Record<string, string>;
  /** True if any {vault_*} placeholder remained empty (Vault missing/failed) */
  hasUnresolvedVaultPlaceholders: boolean;
};

/**
 * Parses and renders a scrape target template into a Prometheus label map.
 *
 * Blank lines and lines without "=" are silently ignored.
 * Lines starting with "#" are treated as comments.
 *
 * @param template   The raw template string stored on the AssetType
 * @param vars       Asset field values for substitution
 * @param vaultSecrets  Key→value from Vault, or null if Vault was unavailable
 */
export function renderScrapeTemplate(
  template: string,
  vars: TemplateVars,
  vaultSecrets: Record<string, string> | null
): RenderedTemplate {
  const labels: Record<string, string> = {};
  let hasUnresolvedVaultPlaceholders = false;

  for (const rawLine of template.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1); // do NOT trim — value may be a URL

    if (!key) continue;

    const rendered = substituteValue(rawValue, vars, vaultSecrets);

    // Check if any vault placeholder was unresolved (stayed as empty string
    // because vaultSecrets was null OR the key was absent from the secret)
    if (templateNeedsVault(rawValue)) {
      const placeholders = getVaultPlaceholders(rawValue);
      for (const ph of placeholders) {
        if (!vaultSecrets?.[ph]) {
          hasUnresolvedVaultPlaceholders = true;
          break;
        }
      }
    }

    labels[key] = rendered;
  }

  return { labels, hasUnresolvedVaultPlaceholders };
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
  vault: string[];
} {
  const standard = new Set<string>();
  const vault = new Set<string>();

  const standardPlaceholders = [
    "hostname_fqdn",
    "serial",
    "model",
    "manufacturer",
    "fi_number",
  ];

  for (const ph of standardPlaceholders) {
    if (template.includes(`{${ph}}`)) standard.add(ph);
  }

  for (const [, key] of template.matchAll(/\{vault_([^}]+)\}/g)) {
    vault.add(key);
  }

  return { standard: Array.from(standard), vault: Array.from(vault) };
}

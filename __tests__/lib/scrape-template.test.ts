import { describe, it, expect } from "vitest";
import {
  renderScrapeTemplate,
  validateTemplate,
  getUsedVariables,
  getVaultPlaceholders,
  templateNeedsVault,
  type TemplateVars,
} from "@/lib/scrape-template";

const baseVars: TemplateVars = {
  hostname_fqdn: "rectest001.ugent.be",
  serial: "SN-12345",
  model: "Pearl-2",
  manufacturer: "Epson",
  fi_number: "14.10.100.013",
};

// ── renderScrapeTemplate ────────────────────────────────────────────────────

describe("renderScrapeTemplate()", () => {
  it("substitutes {hostname_fqdn}", () => {
    const { labels } = renderScrapeTemplate(
      "__address__=https://exporter.example.com\n__param_target__=https://{hostname_fqdn}",
      baseVars,
      null
    );
    expect(labels["__param_target__"]).toBe("https://rectest001.ugent.be");
    expect(labels["__address__"]).toBe("https://exporter.example.com");
  });

  it("substitutes all standard variables", () => {
    const template = [
      "a={hostname_fqdn}",
      "b={serial}",
      "c={model}",
      "d={manufacturer}",
      "e={fi_number}",
    ].join("\n");
    const { labels } = renderScrapeTemplate(template, baseVars, null);
    expect(labels["a"]).toBe("rectest001.ugent.be");
    expect(labels["b"]).toBe("SN-12345");
    expect(labels["c"]).toBe("Pearl-2");
    expect(labels["d"]).toBe("Epson");
    expect(labels["e"]).toBe("14.10.100.013");
  });

  it("injects Vault secret values", () => {
    const template = "__param_user__={vault_username}\n__param_password__={vault_password}";
    const vault = { username: "admin", password: "secret123" };
    const { labels, hasUnresolvedVaultPlaceholders } = renderScrapeTemplate(
      template,
      baseVars,
      vault
    );
    expect(labels["__param_user__"]).toBe("admin");
    expect(labels["__param_password__"]).toBe("secret123");
    expect(hasUnresolvedVaultPlaceholders).toBe(false);
  });

  it("marks unresolved Vault placeholders when secret is null", () => {
    const { hasUnresolvedVaultPlaceholders } = renderScrapeTemplate(
      "__param_password__={vault_password}",
      baseVars,
      null
    );
    expect(hasUnresolvedVaultPlaceholders).toBe(true);
  });

  it("marks unresolved when vault key is missing from secret", () => {
    const { labels, hasUnresolvedVaultPlaceholders } = renderScrapeTemplate(
      "__param_password__={vault_password}",
      baseVars,
      { username: "admin" } // 'password' key missing
    );
    expect(labels["__param_password__"]).toBe(""); // replaced with empty
    expect(hasUnresolvedVaultPlaceholders).toBe(true);
  });

  it("ignores blank lines and comments", () => {
    const template = "# This is a comment\n\n__address__=https://example.com\n# another comment";
    const { labels } = renderScrapeTemplate(template, baseVars, null);
    expect(Object.keys(labels)).toHaveLength(1);
    expect(labels["__address__"]).toBe("https://example.com");
  });

  it("handles lines without '=' gracefully", () => {
    const { labels } = renderScrapeTemplate("not-a-kv-pair\n__k__=v", baseVars, null);
    expect(labels["__k__"]).toBe("v");
    expect(Object.keys(labels)).toHaveLength(1);
  });

  it("returns empty labels for empty template", () => {
    const { labels } = renderScrapeTemplate("", baseVars, null);
    expect(labels).toEqual({});
  });

  it("preserves URL encoding in values (no double-encoding)", () => {
    const template = "__param_target__=https://{hostname_fqdn}/path?a=b&c=d";
    const { labels } = renderScrapeTemplate(template, baseVars, null);
    expect(labels["__param_target__"]).toBe(
      "https://rectest001.ugent.be/path?a=b&c=d"
    );
  });
});

// ── validateTemplate ────────────────────────────────────────────────────────

describe("validateTemplate()", () => {
  it("returns empty array for a valid template", () => {
    const errs = validateTemplate(
      "__address__=https://example.com\n__metrics_path__=/probe"
    );
    expect(errs).toHaveLength(0);
  });

  it("reports a line missing '='", () => {
    const errs = validateTemplate("not-a-pair");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/Missing "="/);
  });

  it("reports duplicate keys", () => {
    const errs = validateTemplate("__address__=foo\n__address__=bar");
    expect(errs.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const errs = validateTemplate("# comment\n\n__k__=v");
    expect(errs).toHaveLength(0);
  });

  it("reports empty key", () => {
    const errs = validateTemplate("=value");
    expect(errs.some((e) => e.toLowerCase().includes("empty key"))).toBe(true);
  });
});

// ── getUsedVariables ────────────────────────────────────────────────────────

describe("getUsedVariables()", () => {
  it("detects standard variable usage", () => {
    const { standard, vault } = getUsedVariables(
      "__t__={hostname_fqdn}\n__s__={serial}"
    );
    expect(standard).toContain("hostname_fqdn");
    expect(standard).toContain("serial");
    expect(vault).toHaveLength(0);
  });

  it("detects vault variable usage", () => {
    const { vault, standard } = getUsedVariables(
      "__u__={vault_username}\n__p__={vault_password}"
    );
    expect(vault).toContain("username");
    expect(vault).toContain("password");
    expect(standard).toHaveLength(0);
  });

  it("returns empty arrays for empty template", () => {
    const { standard, vault } = getUsedVariables("");
    expect(standard).toHaveLength(0);
    expect(vault).toHaveLength(0);
  });
});

// ── getVaultPlaceholders ────────────────────────────────────────────────────

describe("getVaultPlaceholders()", () => {
  it("extracts vault placeholder key names", () => {
    const keys = getVaultPlaceholders("{vault_user} {vault_pass}");
    expect(keys).toContain("user");
    expect(keys).toContain("pass");
  });

  it("deduplicates repeated placeholders", () => {
    const keys = getVaultPlaceholders("{vault_token} {vault_token}");
    expect(keys).toHaveLength(1);
  });

  it("returns empty array when no vault placeholders", () => {
    expect(getVaultPlaceholders("{hostname_fqdn}")).toHaveLength(0);
  });
});

// ── templateNeedsVault ──────────────────────────────────────────────────────

describe("templateNeedsVault()", () => {
  it("returns true when vault placeholder is present", () => {
    expect(templateNeedsVault("__p__={vault_password}")).toBe(true);
  });

  it("returns false when no vault placeholder", () => {
    expect(templateNeedsVault("__a__={hostname_fqdn}")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(templateNeedsVault("")).toBe(false);
  });
});

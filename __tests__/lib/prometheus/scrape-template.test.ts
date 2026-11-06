import { describe, it, expect } from "vitest";
import {
  renderScrapeTemplate,
  resolveScrapeTemplate,
  validateTemplate,
  getUsedVariables,
  type TemplateVars,
  type ScrapeTemplateSource,
} from "@/lib/prometheus/scrape-template";

const baseVars: TemplateVars = {
  hostname_fqdn: "rectest001.ugent.be",
  serial: "SN-12345",
  model: "Pearl-2",
  manufacturer: "Epson",
  fi_number: "14.10.100.013",
  vault_path: "secret/av/rectest001",
};

// ── renderScrapeTemplate ────────────────────────────────────────────────────

describe("renderScrapeTemplate()", () => {
  it("substitutes {hostname_fqdn}", () => {
    const { labels } = renderScrapeTemplate(
      "__address__=https://exporter.example.com\n__param_target__=https://{hostname_fqdn}",
      baseVars
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
      "f={vault_path}",
    ].join("\n");
    const { labels } = renderScrapeTemplate(template, baseVars);
    expect(labels["a"]).toBe("rectest001.ugent.be");
    expect(labels["b"]).toBe("SN-12345");
    expect(labels["c"]).toBe("Pearl-2");
    expect(labels["d"]).toBe("Epson");
    expect(labels["e"]).toBe("14.10.100.013");
    expect(labels["f"]).toBe("secret/av/rectest001");
  });

  it("renders {vault_path} as the reference, not a secret", () => {
    const { labels } = renderScrapeTemplate(
      "__param_vault_path__={vault_path}",
      baseVars
    );
    expect(labels["__param_vault_path__"]).toBe("secret/av/rectest001");
  });

  it("renders {vault_path} empty when the asset has no vault path", () => {
    const { labels } = renderScrapeTemplate("__param_vault_path__={vault_path}", {
      ...baseVars,
      vault_path: "",
    });
    expect(labels["__param_vault_path__"]).toBe("");
  });

  it("ignores blank lines and comments", () => {
    const template = "# This is a comment\n\n__address__=https://example.com\n# another comment";
    const { labels } = renderScrapeTemplate(template, baseVars);
    expect(Object.keys(labels)).toHaveLength(1);
    expect(labels["__address__"]).toBe("https://example.com");
  });

  it("handles lines without '=' gracefully", () => {
    const { labels } = renderScrapeTemplate("not-a-kv-pair\n__k__=v", baseVars);
    expect(labels["__k__"]).toBe("v");
    expect(Object.keys(labels)).toHaveLength(1);
  });

  it("returns empty labels for empty template", () => {
    const { labels } = renderScrapeTemplate("", baseVars);
    expect(labels).toEqual({});
  });

  it("preserves URL encoding in values (no double-encoding)", () => {
    const template = "__param_target__=https://{hostname_fqdn}/path?a=b&c=d";
    const { labels } = renderScrapeTemplate(template, baseVars);
    expect(labels["__param_target__"]).toBe(
      "https://rectest001.ugent.be/path?a=b&c=d"
    );
  });
});

// ── resolveScrapeTemplate ───────────────────────────────────────────────────

describe("resolveScrapeTemplate()", () => {
  const type: ScrapeTemplateSource = {
    scrapeTargetTemplate: "__address__=default",
    manufacturerTemplates: [
      { manufacturerId: "epson", scrapeTargetTemplate: "__address__=epson-default" },
    ],
    modelTemplates: [
      { manufacturerId: "epson", model: "Pearl-2", scrapeTargetTemplate: "__address__=epson-pearl2" },
    ],
  };

  it("falls back to the type default when no manufacturer or model matches", () => {
    expect(resolveScrapeTemplate(type, "other-brand", "Other")).toBe("__address__=default");
    expect(resolveScrapeTemplate(type, null, null)).toBe("__address__=default");
  });

  it("uses the manufacturer override when no model override matches", () => {
    expect(resolveScrapeTemplate(type, "epson", "Some-Other-Model")).toBe("__address__=epson-default");
    expect(resolveScrapeTemplate(type, "epson", null)).toBe("__address__=epson-default");
  });

  it("uses the model override when both manufacturer and model match", () => {
    expect(resolveScrapeTemplate(type, "epson", "Pearl-2")).toBe("__address__=epson-pearl2");
  });

  it("matches model case-insensitively and trims whitespace", () => {
    expect(resolveScrapeTemplate(type, "epson", " pearl-2 ")).toBe("__address__=epson-pearl2");
    expect(resolveScrapeTemplate(type, "epson", "PEARL-2")).toBe("__address__=epson-pearl2");
  });

  it("does not apply a model override matching a different manufacturer", () => {
    expect(resolveScrapeTemplate(type, "other-brand", "Pearl-2")).toBe("__address__=default");
  });

  it("returns null when the type has no default template either", () => {
    const bare: ScrapeTemplateSource = {
      scrapeTargetTemplate: null,
      manufacturerTemplates: [],
      modelTemplates: [],
    };
    expect(resolveScrapeTemplate(bare, "epson", "Pearl-2")).toBeNull();
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
    const standard = getUsedVariables(
      "__t__={hostname_fqdn}\n__s__={serial}"
    );
    expect(standard).toContain("hostname_fqdn");
    expect(standard).toContain("serial");
  });

  it("detects {vault_path} usage", () => {
    const standard = getUsedVariables("__p__={vault_path}");
    expect(standard).toContain("vault_path");
  });

  it("returns empty array for empty template", () => {
    const standard = getUsedVariables("");
    expect(standard).toHaveLength(0);
  });
});

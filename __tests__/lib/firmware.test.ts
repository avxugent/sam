import { describe, it, expect } from "vitest";
import {
  compareVersions,
  matchBaseline,
  firmwareStatus,
  type Baseline,
} from "@/lib/firmware";

describe("compareVersions()", () => {
  it("orders plain dotted versions", () => {
    expect(compareVersions("4.18.1", "4.18.0")).toBeGreaterThan(0);
    expect(compareVersions("4.17.9", "4.18.0")).toBeLessThan(0);
    expect(compareVersions("4.18.1", "4.18.1")).toBe(0);
  });

  it("compares numerically, not lexically", () => {
    // The classic string-sort bug: "4.9" must be below "4.10".
    expect(compareVersions("4.9.0", "4.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0.1234", "1.0.0.987")).toBeGreaterThan(0);
  });

  it("treats a missing trailing segment as zero", () => {
    expect(compareVersions("4.18", "4.18.0")).toBe(0);
    expect(compareVersions("4.18", "4.18.1")).toBeLessThan(0);
  });

  it("ignores a leading v", () => {
    expect(compareVersions("v2.3.1", "2.3.1")).toBe(0);
    expect(compareVersions("V2.4", "2.3.1")).toBeGreaterThan(0);
  });

  it("handles vendor strings that are not semver", () => {
    // Crestron-style four-part, Epson-style two-part.
    expect(compareVersions("1.0.0.1234", "1.0.0.1233")).toBeGreaterThan(0);
    expect(compareVersions("1.08", "1.06")).toBeGreaterThan(0);
    // Separator style must not change the answer.
    expect(compareVersions("2.3-build18", "2.3-build17")).toBeGreaterThan(0);
    expect(compareVersions("2_3_1", "2.3.1")).toBe(0);
  });

  it("returns null when the shapes cannot be ordered", () => {
    // A number against a word has no defensible ordering. Callers must treat
    // this as unknown — never as compliant.
    expect(compareVersions("2.3", "2.beta")).toBeNull();
    expect(compareVersions("2.3-rc", "2.3.1")).toBeNull();
  });

  it("orders words against words so build channels stay stable", () => {
    expect(compareVersions("2.3-alpha", "2.3-beta")).toBeLessThan(0);
    expect(compareVersions("2.3-beta", "2.3-beta")).toBe(0);
  });
});

describe("matchBaseline()", () => {
  const baselines: Baseline[] = [
    { typeId: "recorder", model: null, approvedVersion: "4.18.0" },
    { typeId: "recorder", model: "Pearl Mini", approvedVersion: "4.17.0" },
    { typeId: "projector", model: null, approvedVersion: "1.08" },
  ];

  it("prefers an exact model match over the type-wide row", () => {
    expect(matchBaseline(baselines, "recorder", "Pearl Mini")?.approvedVersion).toBe("4.17.0");
  });

  it("falls back to the type-wide row for an unlisted model", () => {
    expect(matchBaseline(baselines, "recorder", "Pearl Nano")?.approvedVersion).toBe("4.18.0");
  });

  it("returns null for a type with no baseline at all", () => {
    expect(matchBaseline(baselines, "switcher", "ATEM")).toBeNull();
  });

  it("returns null for an asset with no type", () => {
    expect(matchBaseline(baselines, null, "Pearl Mini")).toBeNull();
  });
});

describe("firmwareStatus()", () => {
  const baseline: Baseline = { typeId: "recorder", model: null, approvedVersion: "4.18.0" };

  it("is compliant at the baseline", () => {
    expect(firmwareStatus("4.18.0", baseline)).toBe("compliant");
  });

  it("is compliant above the baseline, so a rollout in progress is not flagged", () => {
    expect(firmwareStatus("4.19.0", baseline)).toBe("compliant");
  });

  it("is outdated below the baseline", () => {
    expect(firmwareStatus("4.12.3", baseline)).toBe("outdated");
  });

  it("is unclassified when no baseline exists — not compliant", () => {
    expect(firmwareStatus("4.18.0", null)).toBe("unclassified");
  });

  it("is no_data when the device reports no version — not compliant", () => {
    // Blackbox-probed devices have no API and can never report firmware.
    expect(firmwareStatus(null, baseline)).toBe("no_data");
    expect(firmwareStatus("", baseline)).toBe("no_data");
  });

  it("is unknown when the versions cannot be ordered — not compliant", () => {
    expect(firmwareStatus("4.18-rc", baseline)).toBe("unknown");
  });

  it("never reports compliant without evidence", () => {
    // The whole point of the extra states: every non-compliant path must stay
    // out of the compliant bucket, or the NIS2 figures overstate coverage.
    const unmeasured = [
      firmwareStatus(null, baseline),
      firmwareStatus("4.18.0", null),
      firmwareStatus("4.18-rc", baseline),
    ];
    expect(unmeasured).not.toContain("compliant");
  });
});

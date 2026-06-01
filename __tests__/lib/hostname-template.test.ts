import { describe, it, expect } from "vitest";
import { renderHostnameUrl, renderMacAddressUrl } from "@/lib/hostname-template";

describe("renderHostnameUrl()", () => {
  it("substitutes all variables", () => {
    const url = renderHostnameUrl("https://x/{hostname}/{serial}/{model}/{manufacturer}", {
      hostname: "pc-01",
      serialNumber: "SN1",
      model: "OptiPlex",
      manufacturer: { name: "Dell" },
    });
    expect(url).toBe("https://x/pc-01/SN1/OptiPlex/Dell");
  });

  it("replaces repeated occurrences of the same variable", () => {
    expect(renderHostnameUrl("{hostname}-{hostname}", { hostname: "h" })).toBe("h-h");
  });

  it("substitutes empty string for null/undefined fields", () => {
    expect(
      renderHostnameUrl("a{hostname}b{serial}c{model}d{manufacturer}e", {
        hostname: null,
        serialNumber: undefined,
        model: null,
        manufacturer: null,
      })
    ).toBe("abcde");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderHostnameUrl("{hostname}/{unknown}", { hostname: "h" })).toBe("h/{unknown}");
  });
});

describe("renderMacAddressUrl()", () => {
  it("renders colon, plain, and dash formats from a colon-separated MAC", () => {
    const t = "{mac}|{mac_plain}|{mac_dash}";
    expect(renderMacAddressUrl(t, "AA:BB:CC:DD:EE:FF")).toBe(
      "aa:bb:cc:dd:ee:ff|aabbccddeeff|aa-bb-cc-dd-ee-ff"
    );
  });

  it("normalizes input regardless of original separator", () => {
    expect(renderMacAddressUrl("{mac_plain}", "aa-bb-cc-dd-ee-ff")).toBe("aabbccddeeff");
    expect(renderMacAddressUrl("{mac_plain}", "aa.bb.cc.dd.ee.ff")).toBe("aabbccddeeff");
    expect(renderMacAddressUrl("{mac}", "aabbccddeeff")).toBe("aa:bb:cc:dd:ee:ff");
  });

  it("lowercases the address", () => {
    expect(renderMacAddressUrl("{mac}", "AABBCCDDEEFF")).toBe("aa:bb:cc:dd:ee:ff");
  });
});

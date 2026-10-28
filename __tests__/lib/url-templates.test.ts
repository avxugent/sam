import { describe, it, expect } from "vitest";
import { renderHostnameUrl, renderLocationUrl, renderMacAddressUrl } from "@/lib/url-templates";

describe("renderHostnameUrl()", () => {
  it("substitutes all variables", () => {
    const url = renderHostnameUrl("https://x/{hostname}/{serial}/{model}/{manufacturer}", {
      hostname: "pc-01",
      serialNumber: "SN1",
      model: { name: "OptiPlex" },
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

describe("renderLocationUrl()", () => {
  it("substitutes all variables", () => {
    const url = renderLocationUrl("https://g/d/sam-room/room?var-fi_number={fi_number}&n={location_name}&i={location_id}", {
      fiNumber: "14.10.100.013",
      name: "Room 013",
      id: "clx0abc",
    });
    expect(url).toBe("https://g/d/sam-room/room?var-fi_number=14.10.100.013&n=Room 013&i=clx0abc");
  });

  it("substitutes an empty string for missing fields rather than the literal placeholder", () => {
    // Callers suppress the link when {fi_number} is used and absent; the
    // renderer itself must not leak "{fi_number}" into a URL either way.
    expect(renderLocationUrl("https://g/{fi_number}", { name: "Store room" })).toBe("https://g/");
    expect(renderLocationUrl("https://g/{location_name}", {})).toBe("https://g/");
  });

  it("replaces every occurrence of a variable", () => {
    expect(renderLocationUrl("{fi_number}/{fi_number}", { fiNumber: "14.10.100.013" })).toBe(
      "14.10.100.013/14.10.100.013"
    );
  });
});

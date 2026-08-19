import { describe, it, expect } from "vitest";
import { normalizeMacAddress, formatMacInputValue } from "@/lib/mac-address";

describe("normalizeMacAddress()", () => {
  it("normalizes an already-canonical address (uppercase, unchanged)", () => {
    expect(normalizeMacAddress("00:1B:66:7F:2F:69")).toBe("00:1B:66:7F:2F:69");
  });

  it("uppercases a lowercase colon-separated address", () => {
    expect(normalizeMacAddress("74:fe:48:7a:82:36")).toBe("74:FE:48:7A:82:36");
  });

  it("converts a hyphen-separated address", () => {
    expect(normalizeMacAddress("00-1b-66-7f-2f-69")).toBe("00:1B:66:7F:2F:69");
  });

  it("converts an address with no separator", () => {
    expect(normalizeMacAddress("001B667F2F69")).toBe("00:1B:66:7F:2F:69");
  });

  it("converts a Cisco dot-grouped address", () => {
    expect(normalizeMacAddress("001B.667F.2F69")).toBe("00:1B:66:7F:2F:69");
  });

  it("converts a space-separated address", () => {
    expect(normalizeMacAddress("00 1B 66 7F 2F 69")).toBe("00:1B:66:7F:2F:69");
  });

  it("returns null for a non-hex character", () => {
    expect(normalizeMacAddress("80:8a:bd:ap:4f:60")).toBeNull();
  });

  it("returns null when digits are missing", () => {
    expect(normalizeMacAddress("00-05-22-BD-98")).toBeNull();
  });

  it("returns null for a stray non-hex prefix", () => {
    expect(normalizeMacAddress("N48:21:0B:2D:9D:74")).toBeNull();
  });
});

describe("formatMacInputValue()", () => {
  it("returns empty string for empty input", () => {
    expect(formatMacInputValue("")).toBe("");
  });

  it("does not insert a colon before the second digit of a group", () => {
    expect(formatMacInputValue("A")).toBe("A");
  });

  it("inserts a colon once a new group starts", () => {
    expect(formatMacInputValue("AAB")).toBe("AA:B");
  });

  it("formats a full address as it fills in", () => {
    expect(formatMacInputValue("001B667F2F69")).toBe("00:1B:66:7F:2F:69");
  });

  it("uppercases lowercase hex digits", () => {
    expect(formatMacInputValue("74fe487a8236")).toBe("74:FE:48:7A:82:36");
  });

  it("strips non-hex characters typed by the user", () => {
    expect(formatMacInputValue("00:1B:66:7F:2F:69")).toBe("00:1B:66:7F:2F:69");
  });

  it("ignores stray letters outside the hex alphabet", () => {
    expect(formatMacInputValue("00g1h66")).toBe("00:16:6");
  });

  it("truncates input beyond 12 hex digits", () => {
    expect(formatMacInputValue("001B667F2F69FFFF")).toBe("00:1B:66:7F:2F:69");
  });
});

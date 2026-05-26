import { describe, it, expect } from "vitest";
import { getAssetTypeIcon } from "@/lib/asset-type-icon";
import {
  Monitor, Laptop, Projector, Printer, Server, Network,
  Phone, Tablet, Camera, Tv, HardDrive, Package,
} from "lucide-react";

describe("getAssetTypeIcon", () => {
  it("returns Package for null/undefined", () => {
    expect(getAssetTypeIcon(null)).toBe(Package);
    expect(getAssetTypeIcon(undefined)).toBe(Package);
    expect(getAssetTypeIcon("")).toBe(Package);
  });

  it("returns Package for unrecognised type", () => {
    expect(getAssetTypeIcon("Unrecognised Asset XYZ")).toBe(Package);
  });

  it("matches projector keywords", () => {
    expect(getAssetTypeIcon("Projector")).toBe(Projector);
    expect(getAssetTypeIcon("Beamer")).toBe(Projector);
  });

  it("matches laptop keywords", () => {
    expect(getAssetTypeIcon("Laptop")).toBe(Laptop);
    expect(getAssetTypeIcon("MacBook Pro")).toBe(Laptop);
  });

  it("matches computer/desktop keywords", () => {
    expect(getAssetTypeIcon("Desktop Computer")).toBe(Monitor);
    expect(getAssetTypeIcon("Workstation")).toBe(Monitor);
  });

  it("matches printer", () => {
    expect(getAssetTypeIcon("Printer")).toBe(Printer);
  });

  it("matches server", () => {
    expect(getAssetTypeIcon("Server")).toBe(Server);
    expect(getAssetTypeIcon("Rack Server")).toBe(Server);
  });

  it("matches network equipment", () => {
    expect(getAssetTypeIcon("Network Switch")).toBe(Network);
  });

  it("matches phone", () => {
    expect(getAssetTypeIcon("Smartphone")).toBe(Phone);
    expect(getAssetTypeIcon("GSM")).toBe(Phone);
  });

  it("matches tablet", () => {
    expect(getAssetTypeIcon("Tablet")).toBe(Tablet);
    expect(getAssetTypeIcon("iPad")).toBe(Tablet);
  });

  it("matches camera", () => {
    expect(getAssetTypeIcon("Camera")).toBe(Camera);
    expect(getAssetTypeIcon("Webcam")).toBe(Camera);
  });

  it("matches TV / smartboard", () => {
    expect(getAssetTypeIcon("Smartboard")).toBe(Tv);
    expect(getAssetTypeIcon("TV Display")).toBe(Tv);
  });

  it("matches storage", () => {
    expect(getAssetTypeIcon("NAS Storage")).toBe(HardDrive);
  });

  it("is case-insensitive", () => {
    expect(getAssetTypeIcon("PROJECTOR")).toBe(Projector);
    expect(getAssetTypeIcon("laptop")).toBe(Laptop);
  });
});

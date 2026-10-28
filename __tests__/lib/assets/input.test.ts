import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { supplier: { findUnique: vi.fn() }, assetType: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  customFieldRows,
  hostnameFormatResponse,
  hostnameTakenResponse,
  macAddressRows,
  unknownSupplierResponse,
} from "@/lib/assets/input";

beforeEach(() => vi.clearAllMocks());

describe("asset write helpers", () => {
  it("unknownSupplierResponse: skips the lookup without a supplier, 400 for an unknown one", async () => {
    expect(await unknownSupplierResponse(null)).toBeNull();
    expect(prisma.supplier.findUnique).not.toHaveBeenCalled();
    vi.mocked(prisma.supplier.findUnique).mockResolvedValueOnce(null as never);
    expect((await unknownSupplierResponse("s1"))?.status).toBe(400);
    vi.mocked(prisma.supplier.findUnique).mockResolvedValueOnce({ id: "s1" } as never);
    expect(await unknownSupplierResponse("s1")).toBeNull();
  });

  it("hostnameFormatResponse: checks the type's pattern only when a hostname is set", async () => {
    expect(await hostnameFormatResponse(null, "t1")).toBeNull();
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ hostnamePattern: "^rec\\d+$" } as never);
    expect((await hostnameFormatResponse("printer", "t1"))?.status).toBe(400);
    expect(await hostnameFormatResponse("rec01", "t1")).toBeNull();
  });

  it("hostnameTakenResponse is a 409", () => {
    expect(hostnameTakenResponse().status).toBe(409);
  });

  it("row builders drop blank MACs and keyless custom fields", () => {
    expect(macAddressRows(["AA:BB:CC:DD:EE:FF", ""])).toEqual([{ address: "AA:BB:CC:DD:EE:FF" }]);
    expect(customFieldRows([{ key: "", value: "x" }, { key: "k", value: "v" }])).toEqual([{ key: "k", value: "v" }]);
  });
});

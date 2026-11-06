import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    location: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST as createLocation } from "@/app/api/locations/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req(url: string, body?: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("audit — location create", () => {
  it("logs CREATE on Location", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.create).mockResolvedValue({ id: "loc1", name: "Room 1" } as never);

    const res = await createLocation(req("http://localhost/api/locations", { name: "Room 1" }));
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "Location", entityId: "loc1", entityName: "Room 1" })
    );
  });
});

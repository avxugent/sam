import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { logAudit } from "@/lib/audit";
import { auditLoginFailure } from "@/lib/login-audit";

describe("auditLoginFailure()", () => {
  it("records a session-less LOGIN_FAILED entry with optional attribution", () => {
    const req = new Request("http://x");
    auditLoginFailure({ req, actor: { id: "u1", email: "a@x.com" }, entityId: "u1", entityName: null, detail: { reason: "invalid_code" } });
    expect(logAudit).toHaveBeenCalledWith({
      session: null,
      actor: { id: "u1", email: "a@x.com" },
      req,
      action: "LOGIN_FAILED",
      entityType: "Auth",
      entityId: "u1",
      entityName: undefined,
      detail: { reason: "invalid_code" },
    });
  });
});

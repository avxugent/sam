// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// lib/auth.ts hands its whole config to NextAuth() at import; capture it so
// the authorize steps and callbacks can be exercised directly.
vi.mock("next-auth", () => ({
  default: vi.fn((config: unknown) => {
    (globalThis as { __authConfig?: unknown }).__authConfig = config;
    const read = vi.fn();
    (globalThis as { __nextAuthRead?: unknown }).__nextAuthRead = read;
    return { handlers: {}, auth: read, signIn: vi.fn(), signOut: vi.fn() };
  }),
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: (options: unknown) => ({ id: "microsoft-entra-id", ...(options as object) }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    appSetting: { findUnique: vi.fn() },
  },
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/audit/login", () => ({ auditLoginFailure: vi.fn() }));
vi.mock("@/lib/two-factor/upgrade-proof", () => ({ verifyUpgradeProof: vi.fn() }));
vi.mock("@/lib/two-factor/remember-device", () => ({ REMEMBER_ME_COOKIE: "sam_2fa_rm", verifyRememberMeToken: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { auditLoginFailure } from "@/lib/audit/login";
import { verifyUpgradeProof } from "@/lib/two-factor/upgrade-proof";
import { cookies } from "next/headers";
import { verifyRememberMeToken } from "@/lib/two-factor/remember-device";
import { auth, authIncludingPendingSteps } from "@/lib/auth";

type Provider = { id: string; authorize: (credentials: unknown, request?: Request) => Promise<Record<string, unknown> | null> };
type Config = {
  providers: Provider[];
  callbacks: {
    signIn: (args: { user: Record<string, unknown>; account: { provider: string } | null }) => Promise<boolean>;
    jwt: (args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    session: (args: { session: { user: Record<string, unknown> } & Record<string, unknown>; token: Record<string, unknown> }) => Record<string, unknown>;
  };
  events: {
    signIn: (args: { user: Record<string, unknown>; account: { provider: string } | null }) => Promise<void>;
    signOut: (message: { token: Record<string, unknown> | null }) => Promise<void>;
  };
  session: { strategy: string; maxAge: number };
};
const config = (globalThis as { __authConfig?: Config }).__authConfig!;
const provider = (id: string) => config.providers.find((p) => p.id === id)!;

const login = (credentials: unknown) =>
  provider("credentials").authorize(credentials, new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9" } }));
const CREDS = { email: "ada@example.com", password: "hunter22" };
const USER = {
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  role: "EDITOR",
  passwordHash: "$2b$13$hash",
  totpEnabled: false,
  mustChangePassword: false,
  twoFactorRequired: false,
  _count: { passkeys: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeRateLimit).mockReturnValue({ allowed: true } as never);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(USER as never);
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
});

describe("credentials authorize()", () => {
  it("rejects malformed input before touching the database", async () => {
    expect(await login({ email: "not-an-email", password: "x" })).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rate-limits by IP and by email, and audits the refusal", async () => {
    vi.mocked(consumeRateLimit).mockImplementation(((key: string) => ({ allowed: !key.startsWith("login:email:") })) as never);
    expect(await login(CREDS)).toBeNull();
    expect(consumeRateLimit).toHaveBeenCalledWith("login:ip:203.0.113.9", 20, 15 * 60 * 1000);
    expect(auditLoginFailure).toHaveBeenCalledWith(expect.objectContaining({ detail: { reason: "rate_limited" } }));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown user", null, "unknown_user"],
    ["an SSO-only account", { ...USER, passwordHash: null }, "sso_only"],
  ])("rejects %s", async (_label, user, reason) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    expect(await login(CREDS)).toBeNull();
    expect(auditLoginFailure).toHaveBeenCalledWith(expect.objectContaining({ detail: { reason } }));
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects a wrong password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    expect(await login(CREDS)).toBeNull();
    expect(auditLoginFailure).toHaveBeenCalledWith(expect.objectContaining({ entityId: "u1", detail: { reason: "invalid_password" } }));
  });

  it("signs in without a second factor when none is set up or required", async () => {
    const user = await login(CREDS);
    expect(user).toEqual({ id: "u1", name: "Ada", email: "ada@example.com", role: "EDITOR", needs2FA: undefined });
  });

  it("returns a partial login that still owes the second factor", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...USER, _count: { passkeys: 1 } } as never);
    expect(await login(CREDS)).toMatchObject({ id: "u1", needs2FA: true });
  });

  it("forces a password change before anything else", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...USER, mustChangePassword: true, totpEnabled: true } as never);
    expect(await login(CREDS)).toMatchObject({ needsPasswordChange: true });
    expect(prisma.appSetting.findUnique).not.toHaveBeenCalled();
  });

  it("forces 2FA setup when the global setting requires it", async () => {
    vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({ value: "true" } as never);
    expect(await login(CREDS)).toMatchObject({ needs2FASetup: true });
  });
});

describe("credentials-2fa-verified authorize()", () => {
  const upgrade = (credentials: unknown) => provider("credentials-2fa-verified").authorize(credentials);

  it("never upgrades on a bare user id: the signed proof is required", async () => {
    vi.mocked(verifyUpgradeProof).mockResolvedValue(false);
    expect(await upgrade({ userId: "u1" })).toBeNull();
    expect(verifyUpgradeProof).toHaveBeenCalledWith(undefined, "u1");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a missing user id", async () => {
    expect(await upgrade({ proof: "p" })).toBeNull();
    expect(verifyUpgradeProof).not.toHaveBeenCalled();
  });

  it("issues a full session for a valid proof", async () => {
    vi.mocked(verifyUpgradeProof).mockResolvedValue(true);
    expect(await upgrade({ userId: "u1", proof: "p", method: "passkey" })).toEqual({
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      role: "EDITOR",
      method: "passkey",
    });
  });

  it("rejects a user that is no longer a password account", async () => {
    vi.mocked(verifyUpgradeProof).mockResolvedValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...USER, passwordHash: null } as never);
    expect(await upgrade({ userId: "u1", proof: "p" })).toBeNull();
  });
});

describe("callbacks", () => {
  afterEach(() => vi.useRealTimers());

  it("jwt copies the pending login steps and clears them on the upgraded login", async () => {
    const partial = await config.callbacks.jwt({ token: {}, user: { id: "u1", role: "EDITOR", needs2FA: true } });
    expect(partial).toMatchObject({ id: "u1", role: "EDITOR", needs2FA: true });
    const full = await config.callbacks.jwt({ token: { ...partial }, user: { id: "u1", role: "EDITOR" } });
    expect(full).not.toHaveProperty("needs2FA");
    expect(full).not.toHaveProperty("needsPasswordChange");
    expect(full).not.toHaveProperty("needs2FASetup");
  });

  it("jwt drops the session once the user no longer exists (checked every 5 minutes)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    const token = { id: "u1", dbCheck: Math.floor(Date.now() / 1000) - 301 };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await config.callbacks.jwt({ token })).toBeNull();

    vi.mocked(prisma.user.findUnique).mockClear();
    const fresh = { id: "u1", dbCheck: Math.floor(Date.now() / 1000) - 10 };
    expect(await config.callbacks.jwt({ token: fresh })).toBe(fresh);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("jwt picks up a role change at the 5-minute recheck", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    const now = Math.floor(Date.now() / 1000);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ role: "VIEWER" } as never);
    const token = await config.callbacks.jwt({ token: { id: "u1", role: "ADMIN", dbCheck: now - 301 } });
    expect(token).toMatchObject({ id: "u1", role: "VIEWER", dbCheck: now });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { role: true } });
  });

  it("jwt rejects a token without a user id", async () => {
    expect(await config.callbacks.jwt({ token: {} })).toBeNull();
  });

  it("session exposes the id, role and pending steps", () => {
    const session = config.callbacks.session({ session: { user: {} }, token: { id: "u1", role: "ADMIN", needs2FA: true } });
    expect(session).toMatchObject({ user: { id: "u1", role: "ADMIN" }, needs2FA: true });
    expect(config.callbacks.session({ session: { user: {} }, token: { id: "u2" } })).toMatchObject({ user: { role: "VIEWER" } });
  });

  it("signIn provisions a first-time Entra ID user as a viewer", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "new1" } as never);
    const user: Record<string, unknown> = { email: "sso@example.com", name: "Sso" };
    expect(await config.callbacks.signIn({ user, account: { provider: "microsoft-entra-id" } })).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "sso@example.com", passwordHash: null, role: "VIEWER" }),
    });
    expect(user).toMatchObject({ id: "new1", role: "VIEWER" });
  });

  it("signIn keeps an existing Entra ID user's role and refuses one without an email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u9", role: "ADMIN" } as never);
    const user: Record<string, unknown> = { email: "boss@example.com" };
    await config.callbacks.signIn({ user, account: { provider: "microsoft-entra-id" } });
    expect(user).toMatchObject({ id: "u9", role: "ADMIN" });
    expect(await config.callbacks.signIn({ user: {}, account: { provider: "microsoft-entra-id" } })).toBe(false);
  });
});

describe("events", () => {
  it("does not log a partial credentials login as a success", async () => {
    await config.events.signIn({ user: { id: "u1", needs2FA: true }, account: { provider: "credentials" } });
    expect(logAudit).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("logs the completed login with the second-factor method and records lastLoginAt", async () => {
    await config.events.signIn({ user: { id: "u1", email: "ada@example.com", method: "passkey" }, account: { provider: "credentials-2fa-verified" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN_SUCCESS", detail: { provider: "credentials+passkey" } }));
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { lastLoginAt: expect.any(Date) } });
  });

  it("logs the logout, and nothing for an expired session", async () => {
    await config.events.signOut({ token: null });
    expect(logAudit).not.toHaveBeenCalled();
    await config.events.signOut({ token: { id: "u1", email: "ada@example.com" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGOUT", entityId: "u1" }));
  });
});

it("keeps JWT sessions at 8 hours", () => {
  expect(config.session).toEqual({ strategy: "jwt", maxAge: 8 * 60 * 60 });
});

describe("auth()", () => {
  const nextAuthRead = (globalThis as { __nextAuthRead?: ReturnType<typeof vi.fn> }).__nextAuthRead!;
  const user = { id: "u1", role: "ADMIN" };

  it("returns a fully signed-in session", async () => {
    nextAuthRead.mockResolvedValue({ user });
    expect(await auth()).toEqual({ user });
  });

  it("hides a session that still owes a login step", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    vi.mocked(verifyRememberMeToken).mockResolvedValue(false);
    for (const pending of [{ needsPasswordChange: true }, { needs2FASetup: true }, { needs2FA: true }]) {
      nextAuthRead.mockResolvedValue({ user, ...pending });
      expect(await auth()).toBeNull();
    }
  });

  it("lets a pending second factor through on a remembered device", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "remember-token" }) } as never);
    vi.mocked(verifyRememberMeToken).mockResolvedValue(true);
    nextAuthRead.mockResolvedValue({ user, needs2FA: true });
    expect(await auth()).toEqual({ user, needs2FA: true });
    expect(verifyRememberMeToken).toHaveBeenCalledWith("remember-token", "u1");
  });

  it("is null without a session; authIncludingPendingSteps is NextAuth's own read", async () => {
    nextAuthRead.mockResolvedValue(null);
    expect(await auth()).toBeNull();
    expect(authIncludingPendingSteps).toBe(nextAuthRead);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock is hoisted — cannot reference variables declared above it.
// Use vi.fn() directly in the factory; retrieve handles via vi.mocked() after import.
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
  },
}));

import nodemailer from "nodemailer";
import { sendPasswordResetEmail } from "@/lib/email";

const mockCreateTransport = vi.mocked(nodemailer.createTransport);

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const FULL_ENV = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "user@example.com",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "noreply@example.com",
};

describe("sendPasswordResetEmail()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnv(FULL_ENV);
  });

  afterEach(() => {
    setEnv(Object.fromEntries(Object.keys(FULL_ENV).map((k) => [k, undefined])));
  });

  it("returns false when SMTP_HOST is not set", async () => {
    setEnv({ SMTP_HOST: undefined });
    expect(await sendPasswordResetEmail("to@example.com", "https://example.com/reset")).toBe(false);
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it("returns false when SMTP_FROM is not set", async () => {
    setEnv({ SMTP_FROM: undefined });
    expect(await sendPasswordResetEmail("to@example.com", "https://example.com/reset")).toBe(false);
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it("sends email and returns true on success", async () => {
    const mockSendMail = vi.fn().mockResolvedValue({});
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail } as never);

    expect(await sendPasswordResetEmail("to@example.com", "https://example.com/reset?token=abc")).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@example.com", from: "noreply@example.com" })
    );
  });

  it("returns false when sendMail throws", async () => {
    const mockSendMail = vi.fn().mockRejectedValue(new Error("SMTP error"));
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail } as never);

    expect(await sendPasswordResetEmail("to@example.com", "https://example.com/reset")).toBe(false);
  });

  it("uses secure=true when port is 465", async () => {
    setEnv({ SMTP_PORT: "465" });
    mockCreateTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) } as never);
    await sendPasswordResetEmail("to@example.com", "https://example.com/reset");
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it("uses secure=false for non-465 port", async () => {
    mockCreateTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) } as never);
    await sendPasswordResetEmail("to@example.com", "https://example.com/reset");
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
  });

  it("omits auth when SMTP credentials are missing", async () => {
    setEnv({ SMTP_USER: undefined, SMTP_PASSWORD: undefined });
    mockCreateTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) } as never);
    await sendPasswordResetEmail("to@example.com", "https://example.com/reset");
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("includes auth when SMTP credentials are set", async () => {
    mockCreateTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) } as never);
    await sendPasswordResetEmail("to@example.com", "https://example.com/reset");
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: "user@example.com", pass: "secret" } })
    );
  });
});

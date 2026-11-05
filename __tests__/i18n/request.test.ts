import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import requestConfig from "@/i18n/request";
import { cookies } from "next/headers";
import en from "@/messages/en.json";
import nl from "@/messages/nl.json";

const resolve = requestConfig as unknown as () => Promise<{ locale: string; messages: unknown }>;

function withCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) => (name === "NEXT_LOCALE" && value !== undefined ? { name, value } : undefined)),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("i18n request config", () => {
  it("uses the locale from the NEXT_LOCALE cookie and loads its messages", async () => {
    withCookie("nl");
    const config = await resolve();
    expect(config.locale).toBe("nl");
    expect(config.messages).toEqual(nl);
  });

  it("falls back to English without a cookie", async () => {
    withCookie(undefined);
    const config = await resolve();
    expect(config.locale).toBe("en");
    expect(config.messages).toEqual(en);
  });

  it("falls back to English for an unsupported cookie value", async () => {
    withCookie("../../etc/passwd");
    const config = await resolve();
    expect(config.locale).toBe("en");
    expect(config.messages).toEqual(en);
  });
});

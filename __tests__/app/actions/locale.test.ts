import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setLocale } from "@/app/actions/locale";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const set = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({ set } as never);
});

describe("setLocale server action", () => {
  it.each(["en", "nl"])("stores %s in the locale cookie for a year and revalidates the layout", async (locale) => {
    await setLocale(locale);
    expect(set).toHaveBeenCalledWith("NEXT_LOCALE", locale, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects an unsupported locale without touching the cookie", async () => {
    await expect(setLocale("fr")).rejects.toThrow("Unsupported locale: fr");
    expect(set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

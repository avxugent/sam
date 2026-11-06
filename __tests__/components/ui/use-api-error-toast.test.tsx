import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

describe("useApiErrorToast()", () => {
  it("shows the server's message with its details", () => {
    const { result } = renderHook(() => useApiErrorToast());
    result.current({ error: "Invalid input", details: ["name too long"] });
    expect(mockToast).toHaveBeenLastCalledWith({ title: "error", description: "Invalid input: name too long", variant: "destructive" });
  });

  it("falls back to the generic message when the response had none", () => {
    const { result } = renderHook(() => useApiErrorToast());
    result.current({});
    expect(mockToast).toHaveBeenLastCalledWith({ title: "error", description: "somethingWentWrong", variant: "destructive" });
  });
});

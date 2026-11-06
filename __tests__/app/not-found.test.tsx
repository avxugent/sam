import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import NotFound from "@/app/not-found";
import { getTranslations } from "next-intl/server";
import { renderPage } from "./helpers";

describe("not-found page", () => {
  it("explains the page is missing and links home", async () => {
    await renderPage(NotFound());
    expect(getTranslations).toHaveBeenCalledWith("common");
    expect(screen.getByRole("heading", { name: "pageNotFound" })).toBeInTheDocument();
    expect(screen.getByText("pageNotFoundBody")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "home" })).toHaveAttribute("href", "/");
  });
});

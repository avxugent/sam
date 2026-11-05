import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/components/search/search-results", () => ({ SearchResults: vi.fn(() => <p>results</p>) }));

import SearchPage, { generateMetadata } from "@/app/(dashboard)/search/page";
import { getTranslations } from "next-intl/server";

describe("search page", () => {
  it("renders the client-side search results", () => {
    render(<SearchPage />);
    expect(screen.getByText("results")).toBeInTheDocument();
  });

  it("titles the page from the search namespace", async () => {
    expect(await generateMetadata()).toEqual({ title: "title" });
    expect(getTranslations).toHaveBeenCalledWith("search");
  });
});

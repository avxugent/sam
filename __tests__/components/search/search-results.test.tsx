import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const tFn = (key: string, values?: { count?: number }) => (values?.count !== undefined ? `${key}:${values.count}` : key);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

import { useSearchParams } from "next/navigation";
import { SearchResults } from "@/components/search/search-results";

function response(total: number) {
  return { results: [], assets: [], locations: [], total, totalAssets: 0, totalLocations: 0, page: 1, pageSize: 20 };
}

beforeEach(() => {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("q=first") as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchResults", () => {
  it("ignores a slow response for a query that has since been replaced", async () => {
    // The first query's response arrives only after the second query's.
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("q=first")) {
        return new Promise<Response>((resolve, reject) => {
          resolveFirst = resolve;
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      return Promise.resolve(new Response(JSON.stringify(response(2))));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<SearchResults />);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("q=second") as never);
    rerender(<SearchResults />);

    expect(await screen.findByText("resultCount:2")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);

    await act(async () => resolveFirst(new Response(JSON.stringify(response(7)))));
    expect(screen.getByText("resultCount:2")).toBeInTheDocument();
    expect(screen.queryByText("searchFailed")).not.toBeInTheDocument();
  });

  it("shows an error when the search request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    render(<SearchResults />);
    expect(await screen.findByText("searchFailed")).toBeInTheDocument();
  });

  it("drops the previous query's results when the next search fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("q=first") ? new Response(JSON.stringify(response(3))) : new Response("{}", { status: 500 })
    ));
    const { rerender } = render(<SearchResults />);
    expect(await screen.findByText("resultCount:3")).toBeInTheDocument();

    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("q=second") as never);
    rerender(<SearchResults />);
    expect(await screen.findByText("searchFailed")).toBeInTheDocument();
    expect(screen.queryByText("resultCount:3")).not.toBeInTheDocument();
  });

  it("names an asset with no model, hostname or serial with the translated fallback", async () => {
    const asset = { id: "a1", model: null, hostname: null, serialNumber: null, type: null, location: { id: "l1", name: "Room 1" } };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ...response(1), assets: [asset], totalAssets: 1, assetPages: 1, locationPages: 0 }))
    ));
    render(<SearchResults />);
    expect(await screen.findByText("unnamedAsset")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiFetch: vi.fn(),
}));

import { LocationMap } from "@/components/locations/location-map";
import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

type Props = Parameters<typeof LocationMap>[0];
function renderMap(props: Partial<Props> = {}) {
  const onUpdate = vi.fn();
  render(<LocationMap locationId="loc1" canEdit onUpdate={onUpdate} {...props} />);
  return onUpdate;
}

const RESULT = {
  display_name: "Sint-Pietersnieuwstraat 25, Gent, België",
  lat: "51.0469",
  lon: "3.7276",
  address: { road: "Sint-Pietersnieuwstraat", city: "Gent", country: "België" },
};

const mapButton = () => screen.getByRole("button", { name: "mapAddress" });
const saveButton = () => screen.getByRole("button", { name: "save" });

beforeEach(() => vi.clearAllMocks());

describe("LocationMap read-only", () => {
  it("shows the address and the OpenStreetMap embed for saved coordinates", () => {
    renderMap({ canEdit: false, address: "Main St 1", city: "Gent", country: "BE", latitude: 51, longitude: 3.5 });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Main St 1")).toBeInTheDocument();
    expect(screen.getByText("Gent, BE")).toBeInTheDocument();
    expect(screen.getByText("51.000000, 3.500000")).toBeInTheDocument();
    const src = screen.getByTitle("mapFrameTitle").getAttribute("src")!;
    expect(src).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=/);
    expect(src).toContain("marker=51,3.5");
    expect(src).toContain("layer=mapnik");
    expect(screen.getByRole("link", { name: /openInOsm/ })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=51&mlon=3.5#map=17/51/3.5",
    );
  });

  it("shows the no-address placeholder without coordinates", () => {
    renderMap({ canEdit: false });
    expect(screen.queryByTitle("mapFrameTitle")).not.toBeInTheDocument();
    expect(screen.getByText("noMapAddress")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows only city and country when there is no street address", () => {
    renderMap({ canEdit: false, city: "Gent" });
    expect(screen.getByText("Gent")).toBeInTheDocument();
  });
});

describe("LocationMap address search", () => {
  it("asks for an address before searching", async () => {
    renderMap();
    expect(screen.queryByTitle("mapFrameTitle")).not.toBeInTheDocument();
    await userEvent.click(mapButton());
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: "mapAddress", variant: "destructive" });
  });

  it("lists the results and applies a picked one, filling city and country", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: [RESULT] });
    renderMap();
    await userEvent.type(screen.getByPlaceholderText("addressPlaceholder"), "Sint-Pietersnieuwstraat 25{Enter}");
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/geocode?q=${encodeURIComponent("Sint-Pietersnieuwstraat 25")}`);
    expect(await screen.findByText("pickGeocodeResult")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: RESULT.display_name }));
    expect(screen.queryByText("pickGeocodeResult")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("cityPlaceholder")).toHaveValue("Gent");
    expect(screen.getByPlaceholderText("countryPlaceholder")).toHaveValue("België");
    expect(screen.getByText("51.046900, 3.727600")).toBeInTheDocument();
    expect(screen.getByTitle("mapFrameTitle").getAttribute("src")).toContain("marker=51.0469,3.7276");
  });

  it("joins address, city and country into the query and keeps a typed city", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      data: [{ ...RESULT, address: { town: "Ghent", country: "Belgium" } }],
    });
    renderMap({ address: "Main St 1", city: "Gent" });
    await userEvent.click(mapButton());
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/geocode?q=${encodeURIComponent("Main St 1, Gent")}`);
    await userEvent.click(await screen.findByRole("button", { name: RESULT.display_name }));
    expect(screen.getByPlaceholderText("cityPlaceholder")).toHaveValue("Gent");
    expect(screen.getByPlaceholderText("countryPlaceholder")).toHaveValue("Belgium");
  });

  it("toasts when there are no results", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: [] });
    renderMap({ city: "Nowhere" });
    await userEvent.click(mapButton());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "geocodeNoResults", description: "geocodeNoResultsHint" }),
    );
    expect(screen.queryByText("pickGeocodeResult")).not.toBeInTheDocument();
  });

  it("localizes the geocodeUnavailable error", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 503, error: { error: "Geocoding unavailable", code: "geocodeUnavailable" } });
    renderMap({ city: "Gent" });
    await userEvent.click(mapButton());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "geocodeFailed", variant: "destructive" }),
    );
  });

  it("shows the server message for other errors", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 429, error: { error: "Too many requests" } });
    renderMap({ city: "Gent" });
    await userEvent.click(mapButton());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "error", description: "Too many requests", variant: "destructive" }),
    );
  });

  it("falls back to geocodeFailed for a body-less error or a non-array response", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 0, error: {} });
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { not: "a list" } as never });
    renderMap({ city: "Gent" });
    await userEvent.click(mapButton());
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    await userEvent.click(mapButton());
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));
    for (const [arg] of mockToast.mock.calls) {
      expect(arg).toEqual({ title: "error", description: "geocodeFailed", variant: "destructive" });
    }
  });

  it("disables the search button while searching", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof apiFetch>>) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderMap({ city: "Gent" });
    await userEvent.click(mapButton());
    expect(mapButton()).toBeDisabled();
    resolve({ ok: true, status: 200, data: [] });
    await waitFor(() => expect(mapButton()).toBeEnabled());
  });
});

describe("LocationMap save", () => {
  it("saves the address and coordinates, sending blanks as null", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: {} });
    const onUpdate = renderMap({ latitude: 51, longitude: 3 });
    await userEvent.type(screen.getByPlaceholderText("cityPlaceholder"), "Gent");
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({ address: "", city: "Gent", country: "", latitude: 51, longitude: 3 }),
    );
    expect(mockApiFetch.mock.calls[0][0]).toBe("/api/locations/loc1");
    expect(mockApiFetch.mock.calls[0][1]!.method).toBe("PUT");
    expect(JSON.parse(mockApiFetch.mock.calls[0][1]!.body as string)).toEqual({
      address: null,
      city: "Gent",
      country: null,
      latitude: 51,
      longitude: 3,
    });
    expect(mockToast).toHaveBeenCalledWith({ title: "locationUpdated" });
  });

  it("saves coordinates picked from a search result", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: [RESULT] });
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const onUpdate = renderMap({ address: "Sint-Pietersnieuwstraat 25" });
    await userEvent.click(mapButton());
    await userEvent.click(await screen.findByRole("button", { name: RESULT.display_name }));
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        address: "Sint-Pietersnieuwstraat 25",
        city: "Gent",
        country: "België",
        latitude: 51.0469,
        longitude: 3.7276,
      }),
    );
  });

  it("toasts a failed save and does not report an update", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 400, error: { error: "Invalid input" } });
    const onUpdate = renderMap();
    await userEvent.click(saveButton());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "error", description: "Invalid input", variant: "destructive" })),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("shows the saving label while saving", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof apiFetch>>) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderMap();
    await userEvent.click(saveButton());
    expect(screen.getByRole("button", { name: "saving" })).toBeDisabled();
    resolve({ ok: true, status: 200, data: {} });
    expect(await screen.findByRole("button", { name: "save" })).toBeEnabled();
  });
});

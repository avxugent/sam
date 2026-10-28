import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelAutocomplete, type ModelOption } from "@/components/inventory/model-autocomplete";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

function jsonResp(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data });
}

function Harness({ typeId, manufacturerId }: { typeId?: string; manufacturerId?: string }) {
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<ModelOption | null>(null);
  return (
    <div>
      <ModelAutocomplete
        value={value}
        typeId={typeId}
        manufacturerId={manufacturerId}
        placeholder="model placeholder"
        emptyLabel="No models for this scope"
        noMatchLabel={(v) => `No results for "${v}"`}
        onChange={(modelId, option) => {
          setValue(modelId);
          setPicked(option);
        }}
      />
      <p data-testid="picked">{picked ? picked.name : ""}</p>
    </div>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => jsonResp([]));
});

describe("<ModelAutocomplete />", () => {
  it("fetches the scoped model list whenever typeId/manufacturerId changes", async () => {
    render(<Harness typeId="t1" manufacturerId="m1" />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = new URL(mockFetch.mock.calls.at(-1)![0], "http://localhost");
    expect(url.searchParams.get("typeId")).toBe("t1");
    expect(url.searchParams.get("manufacturerId")).toBe("m1");
  });

  it("shows the scoped options on focus, before any typing", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ id: "mo1", name: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByPlaceholderText("model placeholder"));

    expect(await screen.findByText("Dell PowerEdge R740")).toBeInTheDocument();
  });

  it("selecting an option sets the modelId and fires onChange with the full option", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ id: "mo1", name: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("model placeholder");
    await user.click(input);
    const option = await screen.findByText("Dell PowerEdge R740");
    await user.click(option);

    expect(input).toHaveValue("Dell PowerEdge R740");
    expect(screen.getByTestId("picked")).toHaveTextContent("Dell PowerEdge R740");
  });

  it("filters the dropdown by the typed text without an inline create option", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ id: "mo1", name: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("model placeholder");
    await user.type(input, "R750");

    expect(await screen.findByText('No results for "R750"')).toBeInTheDocument();
    expect(screen.queryByText(/^Create /)).not.toBeInTheDocument();
  });

  it("shows the empty-scope state when no models exist for this type/manufacturer", async () => {
    mockFetch.mockImplementation(() => jsonResp([]));
    const user = userEvent.setup();
    render(<Harness typeId="t1" />);

    await user.click(screen.getByPlaceholderText("model placeholder"));

    expect(await screen.findByText("No models for this scope")).toBeInTheDocument();
  });
});

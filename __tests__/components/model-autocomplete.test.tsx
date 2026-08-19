import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelAutocomplete, type ModelSuggestion } from "@/components/model-autocomplete";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

function jsonResp(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data });
}

function Harness({ typeId, manufacturerId }: { typeId?: string; manufacturerId?: string }) {
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<ModelSuggestion | null>(null);
  return (
    <div>
      <ModelAutocomplete
        registered={{
          name: "model",
          onChange: async (e) => setValue(e.target.value),
          onBlur: async () => {},
          ref: () => {},
        }}
        value={value}
        typeId={typeId}
        manufacturerId={manufacturerId}
        placeholder="model placeholder"
        createLabel={(v) => `Create "${v}"`}
        noResultsLabel={(v) => `No results for "${v}"`}
        onSelect={(s) => {
          setValue(s.model);
          setPicked(s);
        }}
      />
      <p data-testid="picked">{picked ? picked.model : ""}</p>
    </div>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => jsonResp([]));
});

describe("<ModelAutocomplete />", () => {
  it("debounce-fetches suggestions scoped by typeId/manufacturerId", async () => {
    const user = userEvent.setup();
    render(<Harness typeId="t1" manufacturerId="m1" />);

    await user.type(screen.getByPlaceholderText("model placeholder"), "Dell");

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = new URL(mockFetch.mock.calls.at(-1)![0], "http://localhost");
    expect(url.searchParams.get("q")).toBe("Dell");
    expect(url.searchParams.get("typeId")).toBe("t1");
    expect(url.searchParams.get("manufacturerId")).toBe("m1");
  });

  it("shows suggestions immediately on focus, before any typing", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ model: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByPlaceholderText("model placeholder"));

    const url = await waitFor(() => new URL(mockFetch.mock.calls.at(-1)![0], "http://localhost"));
    expect(url.searchParams.get("q")).toBe("");
    expect(await screen.findByText("Dell PowerEdge R740")).toBeInTheDocument();
  });

  it("selecting a suggestion sets the exact stored spelling and fires onSelect", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ model: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("model placeholder");
    await user.type(input, "dell poweredge");

    const option = await screen.findByText("Dell PowerEdge R740");
    await user.click(option);

    expect(input).toHaveValue("Dell PowerEdge R740");
    expect(screen.getByTestId("picked")).toHaveTextContent("Dell PowerEdge R740");
  });

  it("shows a create option only when nothing matches the typed value", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ model: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("model placeholder");
    await user.type(input, "Dell PowerEdge R750");

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(await screen.findByText('Create "Dell PowerEdge R750"')).toBeInTheDocument();
  });

  it("hides the create option when the typed value is only a case/spacing variant of an existing spelling", async () => {
    mockFetch.mockImplementation(() =>
      jsonResp([{ model: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" }])
    );
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("model placeholder");
    await user.type(input, "dell poweredge r740");

    await screen.findByText("Dell PowerEdge R740");
    expect(screen.queryByText(/^Create /)).not.toBeInTheDocument();
  });

  it("shows the empty state for a query that normalizes to nothing (punctuation only)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("model placeholder");
    await user.type(input, "---");

    expect(await screen.findByText('No results for "---"')).toBeInTheDocument();
    expect(screen.queryByText(/^Create /)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManufacturerAutocomplete } from "@/components/inventory/manufacturer-autocomplete";

const OPTIONS = [
  { id: "m1", name: "Dell" },
  { id: "m2", name: "Sony" },
];

function setup(value = "") {
  const onChange = vi.fn();
  render(
    <ManufacturerAutocomplete id="mfr" aria-label="Manufacturer" value={value} options={OPTIONS} noneLabel="None" onChange={onChange} />
  );
  return { onChange, input: screen.getByLabelText("Manufacturer") as HTMLInputElement };
}

describe("<ManufacturerAutocomplete />", () => {
  it("shows the selected manufacturer's name", () => {
    expect(setup("m2").input.value).toBe("Sony");
  });

  it("filters the options while typing and clears the selection without picking", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "so");
    expect(onChange).toHaveBeenLastCalledWith("", false);
    expect(screen.queryByRole("button", { name: "Dell" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sony" })).toBeInTheDocument();
  });

  it("reports a picked option, and the none entry as a picked empty selection", async () => {
    const { input, onChange } = setup();
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Dell" }));
    expect(onChange).toHaveBeenLastCalledWith("m1", true);
    expect(input.value).toBe("Dell");

    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith("", true);
    expect(input.value).toBe("");
  });
});

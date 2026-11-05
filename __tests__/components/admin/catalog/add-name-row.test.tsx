import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { AddButton, AddNameRow } from "@/components/admin/catalog/add-name-row";

function Row({ onAdd, adding = false }: { onAdd: () => void; adding?: boolean }) {
  const [name, setName] = useState("");
  return <AddNameRow name={name} onNameChange={setName} placeholder="New name" adding={adding} onAdd={onAdd} />;
}

describe("AddButton", () => {
  it("is disabled while the name is blank", () => {
    render(<AddButton name="   " adding={false} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "add" })).toBeDisabled();
  });

  it("is disabled with a spinner while adding", () => {
    render(<AddButton name="Dell" adding onAdd={vi.fn()} />);
    const button = screen.getByRole("button", { name: "add" });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });

  it("calls onAdd when clicked with a name", async () => {
    const onAdd = vi.fn();
    render(<AddButton name="Dell" adding={false} onAdd={onAdd} />);
    const button = screen.getByRole("button", { name: "add" });
    expect(button.querySelector(".animate-spin")).toBeNull();
    await userEvent.click(button);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("AddNameRow", () => {
  it("enables the button once a name is typed and adds on click", async () => {
    const onAdd = vi.fn();
    render(<Row onAdd={onAdd} />);
    const button = screen.getByRole("button", { name: "add" });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("New name"), "HP");
    expect(screen.getByPlaceholderText("New name")).toHaveValue("HP");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("adds on Enter", async () => {
    const onAdd = vi.fn();
    render(<Row onAdd={onAdd} />);
    await userEvent.type(screen.getByPlaceholderText("New name"), "HP{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("does not add on other keys", async () => {
    const onAdd = vi.fn();
    render(<Row onAdd={onAdd} />);
    await userEvent.type(screen.getByPlaceholderText("New name"), "HP{Tab}");
    expect(onAdd).not.toHaveBeenCalled();
  });
});

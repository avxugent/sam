import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortableTh } from "@/components/ui/sortable-th";

function renderTh(props: Partial<Parameters<typeof SortableTh<"name" | "date">>[0]> = {}) {
  const onSort = vi.fn();
  render(
    <table>
      <thead>
        <tr>
          <SortableTh col="name" label="Name" sortCol={null} sortDir="asc" onSort={onSort} {...props} />
        </tr>
      </thead>
    </table>
  );
  return onSort;
}

describe("SortableTh", () => {
  it("is keyboard-operable and reports the clicked column", async () => {
    const onSort = renderTh();
    screen.getByRole("button", { name: "Name" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it.each([
    [null, "asc", "none"],
    ["name", "asc", "ascending"],
    ["name", "desc", "descending"],
    ["date", "desc", "none"],
  ] as const)("aria-sort for sortCol=%s dir=%s is %s", (sortCol, sortDir, expected) => {
    renderTh({ sortCol, sortDir });
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", expected);
  });
});

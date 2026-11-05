import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  SELECT_NONE,
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

describe("<AlertDialog />", () => {
  function renderDialog(onAction = vi.fn()) {
    render(
      <AlertDialog>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogContent className="custom-content">
          <AlertDialogHeader className="custom-header">
            <AlertDialogTitle className="custom-title">Delete asset?</AlertDialogTitle>
            <AlertDialogDescription className="custom-desc">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="custom-footer">
            <AlertDialogCancel className="custom-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction className="custom-action" onClick={onAction}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
    return onAction;
  }

  it("opens from the trigger as a labelled alertdialog with merged classes", async () => {
    renderDialog();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete asset?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(dialog).toHaveClass("custom-content", "fixed", "grid");
    expect(screen.getByText("Delete asset?")).toHaveClass("custom-title", "text-lg");
    expect(screen.getByText("This cannot be undone.")).toHaveClass("custom-desc", "text-sm");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("custom-cancel", "mt-2", "border");
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass("custom-action", "inline-flex");
  });

  it("closes on cancel without running the action", async () => {
    const onAction = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("runs the action and closes", async () => {
    const onAction = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("forwards refs to the title", async () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogTitle ref={ref}>T</AlertDialogTitle>
          <AlertDialogDescription>D</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>
    );
    expect(ref.current).toBe(screen.getByText("T"));
  });
});

describe("<DropdownMenu />", () => {
  it("opens from the trigger and runs an item's handler", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent className="custom-content">
          <DropdownMenuItem onSelect={onSelect}>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menu")).toHaveClass("custom-content", "z-50");

    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders labels, groups, separators, shortcuts and inset items", () => {
    const itemRef = createRef<HTMLDivElement>();
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset className="custom-label">Account</DropdownMenuLabel>
          <DropdownMenuSeparator className="custom-sep" />
          <DropdownMenuGroup>
            <DropdownMenuItem ref={itemRef} inset className="custom-item">
              Profile <DropdownMenuShortcut className="custom-shortcut">⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Billing</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByText("Account")).toHaveClass("custom-label", "pl-8", "font-semibold");
    expect(screen.getByRole("separator")).toHaveClass("custom-sep", "h-px");
    const profile = screen.getByRole("menuitem", { name: /Profile/ });
    expect(profile).toHaveClass("custom-item", "pl-8");
    expect(itemRef.current).toBe(profile);
    expect(screen.getByText("⌘P")).toHaveClass("custom-shortcut", "ml-auto");
    expect(screen.getByRole("menuitem", { name: "Billing" })).toHaveAttribute("data-disabled");
  });

  it("checkbox and radio items reflect and report their state", async () => {
    const onCheckedChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked onCheckedChange={onCheckedChange} className="custom-check">
            Show archived
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="list" onValueChange={onValueChange}>
            <DropdownMenuRadioItem value="list" className="custom-radio">List</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="grid">Grid</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const check = screen.getByRole("menuitemcheckbox", { name: "Show archived" });
    expect(check).toHaveAttribute("aria-checked", "true");
    expect(check).toHaveClass("custom-check", "pl-8");
    expect(screen.getByRole("menuitemradio", { name: "List" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "List" })).toHaveClass("custom-radio");
    expect(screen.getByRole("menuitemradio", { name: "Grid" })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(screen.getByRole("menuitemradio", { name: "Grid" }));
    expect(onValueChange).toHaveBeenCalledWith("grid");
  });

  it("toggling a checkbox item reports the new state", async () => {
    const onCheckedChange = vi.fn();
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={false} onCheckedChange={onCheckedChange}>Show archived</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Show archived" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("renders an open submenu with its trigger and content", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset className="custom-subtrigger">More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="custom-subcontent">
              <DropdownMenuItem>Nested</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const subTrigger = screen.getByRole("menuitem", { name: "More" });
    expect(subTrigger).toHaveClass("custom-subtrigger", "pl-8");
    expect(subTrigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.getByRole("menuitem", { name: "Nested" })).toBeInTheDocument();
    const menus = screen.getAllByRole("menu");
    expect(menus.some((m) => m.classList.contains("custom-subcontent"))).toBe(true);
  });
});

describe("<Select />", () => {
  it("opens, lists grouped options and reports the picked value", async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Criticality" className="custom-trigger">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent className="custom-content">
          <SelectGroup>
            <SelectLabel className="custom-label">Levels</SelectLabel>
            <SelectItem value={SELECT_NONE}>None</SelectItem>
            <SelectSeparator className="custom-sep" />
            <SelectItem value="high" className="custom-item">High</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    const trigger = screen.getByRole("combobox", { name: "Criticality" });
    expect(trigger).toHaveClass("custom-trigger", "h-9");
    expect(trigger).toHaveTextContent("Pick one");

    await userEvent.click(trigger);
    expect(screen.getByRole("listbox")).toHaveClass("custom-content", "data-[side=bottom]:translate-y-1");
    expect(screen.getByText("Levels")).toHaveClass("custom-label", "font-semibold");
    expect(screen.getByRole("option", { name: "High" })).toHaveClass("custom-item", "pr-8");

    await userEvent.click(screen.getByRole("option", { name: "High" }));
    expect(onValueChange).toHaveBeenCalledWith("high");
    expect(trigger).toHaveTextContent("High");
  });

  it("uses the reserved none value", () => {
    expect(SELECT_NONE).toBe("__none__");
    expect(SELECT_NONE).not.toBe("");
  });

  it("drops the popper offsets in item-aligned mode", () => {
    render(
      <Select defaultOpen defaultValue="a">
        <SelectTrigger aria-label="Pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="item-aligned">
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    );
    const listbox = screen.getByRole("listbox");
    expect(listbox).not.toHaveClass("data-[side=bottom]:translate-y-1");
    expect(screen.getByRole("option", { name: "A" })).toHaveAttribute("aria-selected", "true");
  });

  it("forwards the trigger ref and respects disabled", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Select disabled>
        <SelectTrigger ref={ref} aria-label="Pick">
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(ref.current).toBe(screen.getByRole("combobox", { name: "Pick" }));
    expect(ref.current).toBeDisabled();
  });
});

describe("<Separator />", () => {
  it("is decorative and horizontal by default", () => {
    const { container } = render(<Separator className="custom-sep" />);
    const sep = container.firstElementChild as HTMLElement;
    expect(sep).toHaveAttribute("role", "none");
    expect(sep).toHaveClass("custom-sep", "h-[1px]", "w-full", "bg-border");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("exposes a vertical, non-decorative separator to assistive tech", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Separator ref={ref} orientation="vertical" decorative={false} />);
    const sep = screen.getByRole("separator");
    expect(sep).toHaveAttribute("aria-orientation", "vertical");
    expect(sep).toHaveClass("h-full", "w-[1px]");
    expect(ref.current).toBe(sep);
  });
});

describe("<Tabs />", () => {
  it("switches panels on click and merges classes", async () => {
    const listRef = createRef<HTMLDivElement>();
    render(
      <Tabs defaultValue="assets">
        <TabsList ref={listRef} className="custom-list">
          <TabsTrigger value="assets" className="custom-trigger">Assets</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="off" disabled>Off</TabsTrigger>
        </TabsList>
        <TabsContent value="assets" className="custom-content">Asset panel</TabsContent>
        <TabsContent value="stock">Stock panel</TabsContent>
      </Tabs>
    );
    const list = screen.getByRole("tablist");
    expect(list).toHaveClass("custom-list", "inline-flex");
    expect(listRef.current).toBe(list);
    expect(screen.getByRole("tab", { name: "Assets" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Assets" })).toHaveClass("custom-trigger");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Asset panel");
    expect(screen.getByRole("tabpanel")).toHaveClass("custom-content", "mt-2");
    expect(screen.getByRole("tab", { name: "Off" })).toBeDisabled();

    await userEvent.click(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.getByRole("tab", { name: "Stock" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Stock panel");
  });
});

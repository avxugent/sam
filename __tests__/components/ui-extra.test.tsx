import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

describe("<Checkbox />", () => {
  it("toggles checked state on click", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="agree" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "agree" });
    expect(box).toHaveAttribute("data-state", "unchecked");
    await user.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("merges custom className", () => {
    render(<Checkbox aria-label="x" className="custom-cls" />);
    expect(screen.getByRole("checkbox", { name: "x" }).className).toContain("custom-cls");
  });
});

describe("<Textarea />", () => {
  it("accepts multi-line input", async () => {
    const user = userEvent.setup();
    render(<Textarea placeholder="notes" />);
    const ta = screen.getByPlaceholderText("notes");
    await user.type(ta, "line1");
    expect(ta).toHaveValue("line1");
  });
});

describe("<Card />", () => {
  it("renders all subcomponents", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Foot")).toBeInTheDocument();
  });
});

describe("<Dialog />", () => {
  it("opens on trigger and shows title, description, and content", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Dialog</DialogTitle>
            <DialogDescription>Some description</DialogDescription>
          </DialogHeader>
          <p>Inner content</p>
          <DialogFooter>Footer</DialogFooter>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText("My Dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("My Dialog")).toBeInTheDocument();
    expect(screen.getByText("Some description")).toBeInTheDocument();
    expect(screen.getByText("Inner content")).toBeInTheDocument();
    // Radix renders a built-in Close button labelled "Close"
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("closes when the close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("T")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("T")).not.toBeInTheDocument();
  });
});

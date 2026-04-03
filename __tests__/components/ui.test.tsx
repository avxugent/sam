import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Button ────────────────────────────────────────────────────────────────────

describe("<Button />", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Go</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>No click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders variant classes for destructive", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/destructive/);
  });

  it("renders outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole("button").className).toMatch(/border/);
  });

  it("renders icon size", () => {
    render(<Button size="icon" aria-label="icon">X</Button>);
    expect(screen.getByRole("button").className).toMatch(/h-9.*w-9|w-9.*h-9/);
  });
});

// ── Badge ─────────────────────────────────────────────────────────────────────

describe("<Badge />", () => {
  it("renders its text", () => {
    render(<Badge>ADMIN</Badge>);
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("applies secondary variant classes", () => {
    const { container } = render(<Badge variant="secondary">EDITOR</Badge>);
    expect(container.firstChild as HTMLElement).toHaveClass("bg-secondary");
  });

  it("applies outline variant classes", () => {
    const { container } = render(<Badge variant="outline">VIEWER</Badge>);
    // outline has no background fill
    expect(container.firstChild as HTMLElement).toHaveClass("text-foreground");
  });

  it("applies destructive variant classes", () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>);
    expect(container.firstChild as HTMLElement).toHaveClass("bg-destructive");
  });
});

// ── Input ─────────────────────────────────────────────────────────────────────

describe("<Input />", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("accepts typed text", async () => {
    const user = userEvent.setup();
    render(<Input />);
    const input = screen.getByRole("textbox");
    await user.type(input, "Hello");
    expect(input).toHaveValue("Hello");
  });

  it("respects the type prop", () => {
    render(<Input type="email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});

// ── Label ─────────────────────────────────────────────────────────────────────

describe("<Label />", () => {
  it("renders its text", () => {
    render(<Label>Email address</Label>);
    expect(screen.getByText("Email address")).toBeInTheDocument();
  });

  it("associates with an input via htmlFor", () => {
    render(
      <>
        <Label htmlFor="email-field">Email</Label>
        <Input id="email-field" />
      </>
    );
    const label = screen.getByText("Email");
    expect(label).toHaveAttribute("for", "email-field");
  });
});

// ── Textarea ──────────────────────────────────────────────────────────────────

describe("<Textarea />", () => {
  it("renders a textarea", () => {
    render(<Textarea placeholder="Notes..." />);
    expect(screen.getByPlaceholderText("Notes...")).toBeInTheDocument();
  });

  it("accepts typed text", async () => {
    const user = userEvent.setup();
    render(<Textarea />);
    const ta = screen.getByRole("textbox");
    await user.type(ta, "hello world");
    expect(ta).toHaveValue("hello world");
  });
});

// ── Card ──────────────────────────────────────────────────────────────────────

describe("<Card />", () => {
  it("renders title and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>My Card</CardTitle>
        </CardHeader>
        <CardContent>Body text</CardContent>
      </Card>
    );
    expect(screen.getByText("My Card")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });
});

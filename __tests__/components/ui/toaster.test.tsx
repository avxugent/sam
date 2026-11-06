import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";

// use-toast keeps its queue in module state: dismiss whatever a test raised.
let dismissLast: (() => void) | null = null;
afterEach(() => {
  if (dismissLast) act(() => dismissLast!());
  dismissLast = null;
});

describe("<Toast /> primitives", () => {
  it("renders title, description, action and close with merged classes", async () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ToastProvider>
        <Toast open onOpenChange={onOpenChange} className="custom-toast">
          <ToastTitle className="custom-title">Saved</ToastTitle>
          <ToastDescription className="custom-desc">All good</ToastDescription>
          <ToastAction altText="Undo the save" onClick={onAction} className="custom-action">Undo</ToastAction>
          <ToastClose className="custom-close" aria-label="Close" />
        </Toast>
        <ToastViewport className="custom-viewport" />
      </ToastProvider>
    );
    expect(screen.getByText("Saved")).toHaveClass("custom-title", "font-semibold");
    expect(screen.getByText("All good")).toHaveClass("custom-desc", "opacity-90");
    const toastEl = screen.getByText("Saved").closest("li");
    expect(toastEl).toHaveClass("custom-toast", "bg-background");
    expect(toastEl?.parentElement).toHaveClass("custom-viewport", "fixed");

    const action = screen.getByRole("button", { name: "Undo" });
    expect(action).toHaveClass("custom-action", "h-8");
    await userEvent.click(action);
    expect(onAction).toHaveBeenCalledOnce();

    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("custom-close", "absolute");
    expect(close).toHaveAttribute("toast-close", "");
    await userEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("applies the destructive variant", () => {
    render(
      <ToastProvider>
        <Toast open variant="destructive">
          <ToastTitle>Failed</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );
    expect(screen.getByText("Failed").closest("li")).toHaveClass("destructive", "bg-destructive");
  });
});

describe("<Toaster />", () => {
  it("renders nothing but the viewport when no toast is queued", () => {
    render(<Toaster />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a queued toast with its title, description and action", () => {
    render(<Toaster />);
    act(() => {
      dismissLast = toast({
        title: "Asset saved",
        description: "PC-001 was updated",
        action: <ToastAction altText="View">View</ToastAction>,
      }).dismiss;
    });
    expect(screen.getByText("Asset saved")).toBeInTheDocument();
    expect(screen.getByText("PC-001 was updated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("omits the title or description when the toast has none", () => {
    render(<Toaster />);
    act(() => {
      dismissLast = toast({ description: "Only a description" }).dismiss;
    });
    const toastEl = screen.getByText("Only a description").closest("li")!;
    expect(toastEl.querySelectorAll(".font-semibold")).toHaveLength(0);
  });

  it("passes the variant through to the toast", () => {
    render(<Toaster />);
    act(() => {
      dismissLast = toast({ title: "Boom", variant: "destructive" }).dismiss;
    });
    expect(screen.getByText("Boom").closest("li")).toHaveClass("destructive");
  });

  it("shows only the newest toast", () => {
    render(<Toaster />);
    act(() => {
      toast({ title: "First" });
      dismissLast = toast({ title: "Second" }).dismiss;
    });
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });

  it("closes a toast from its close button", async () => {
    render(<Toaster />);
    act(() => {
      dismissLast = toast({ title: "Closable" }).dismiss;
    });
    const toastEl = screen.getByText("Closable").closest("li")!;
    await userEvent.click(toastEl.querySelector("[toast-close]")!);
    expect(screen.queryByText("Closable")).not.toBeInTheDocument();
  });
});

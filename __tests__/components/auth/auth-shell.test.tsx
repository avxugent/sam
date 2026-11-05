import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthShell } from "@/components/auth/auth-shell";

describe("AuthShell", () => {
  it("shows the app title and the page content", () => {
    render(<AuthShell appTitle="Inventory" logoUrl={null}><p>form</p></AuthShell>);
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("form")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows the branding logo when there is one", () => {
    render(<AuthShell appTitle="SAM" logoUrl="/api/branding/logo"><p>form</p></AuthShell>);
    expect(document.querySelector("img")).toHaveAttribute("src", "/api/branding/logo");
  });
});

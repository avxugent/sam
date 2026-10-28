import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

describe("PageHeader", () => {
  it("renders the title as the page heading with an optional subtitle", () => {
    render(<PageHeader icon={MapPin} title="Locations" subtitle="3 assets" />);
    expect(screen.getByRole("heading", { level: 1, name: "Locations" })).toBeInTheDocument();
    expect(screen.getByText("3 assets")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a back link when given", () => {
    render(<PageHeader icon={MapPin} title="Edit" back={{ href: "/reports/r1", label: "My report" }} />);
    expect(screen.getByRole("link", { name: "My report" })).toHaveAttribute("href", "/reports/r1");
  });
});

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => {
  const t = Object.assign((key: string) => key, {
    rich: (key: string, values: Record<string, (chunks: string) => unknown>) => values.code(key),
  });
  return { useTranslations: () => t };
});

import { ScrapeTemplateFields, TemplatePreview, TEMPLATE_PLACEHOLDER } from "@/components/admin/catalog/scrape-template-fields";

function Editor({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <ScrapeTemplateFields label="Default template" value={value} onChange={setValue} />;
}

describe("TemplatePreview", () => {
  it("renders nothing for a blank template", () => {
    const { container } = render(<TemplatePreview template={"  \n "} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reports a valid template and lists the variables it uses", () => {
    render(<TemplatePreview template={"__address__=https://{hostname_fqdn}\n__param_serial={serial}"} />);
    expect(screen.getByText("syntaxValid")).toBeInTheDocument();
    expect(screen.getByText("{hostname_fqdn}")).toBeInTheDocument();
    expect(screen.getByText("{serial}")).toBeInTheDocument();
    expect(screen.queryByText("{model}")).not.toBeInTheDocument();
  });

  it("lists validation errors instead of the valid notice", () => {
    render(<TemplatePreview template="no separator here" />);
    expect(screen.queryByText("syntaxValid")).not.toBeInTheDocument();
    expect(screen.getByText(/Line 1: Missing "=" separator/)).toBeInTheDocument();
  });

  it("shows no variable list when none are used", () => {
    const { container } = render(<TemplatePreview template="__metrics_path__=/probe" />);
    expect(screen.getByText("syntaxValid")).toBeInTheDocument();
    expect(container.querySelectorAll("code")).toHaveLength(0);
  });
});

describe("ScrapeTemplateFields", () => {
  it("shows the help box, the label and the placeholder textarea", () => {
    render(<Editor />);
    expect(screen.getByText("formatTitle")).toBeInTheDocument();
    expect(screen.getByText("formatHelp")).toBeInTheDocument();
    expect(screen.getByText("varVaultPath")).toBeInTheDocument();
    expect(screen.getByText("Default template")).toBeInTheDocument();
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("placeholder", TEMPLATE_PLACEHOLDER);
    expect(screen.queryByText("syntaxValid")).not.toBeInTheDocument();
  });

  it("forwards edits and previews the typed template live", async () => {
    render(<Editor />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "__param_target={{model}");
    expect(textarea).toHaveValue("__param_target={model}");
    expect(screen.getByText("syntaxValid")).toBeInTheDocument();
    expect(screen.getAllByText("{model}").length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

import { AddLinkDialog } from "@/components/attachments/add-link-dialog";
import { EditAttachmentDialog } from "@/components/attachments/edit-attachment-dialog";
import { AttachmentLightbox } from "@/components/attachments/attachment-lightbox";
import { attachmentLabel, isPreviewableImage, type Attachment } from "@/components/attachments/attachment";

function jsonResp(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

const base: Attachment = {
  id: "att-1",
  originalName: "photo.jpg",
  createdAt: "2026-01-01T00:00:00.000Z",
  uploadedBy: { id: "u1", name: "Ann" },
};

beforeEach(() => vi.clearAllMocks());

describe("attachment helpers", () => {
  it("labels by display name, else the original name", () => {
    expect(attachmentLabel({ ...base, displayName: " Front " })).toBe("Front");
    expect(attachmentLabel({ ...base, displayName: "  " })).toBe("photo.jpg");
  });

  it("previews raster images but not SVG", () => {
    expect(isPreviewableImage("image/png")).toBe(true);
    expect(isPreviewableImage("image/svg+xml")).toBe(false);
    expect(isPreviewableImage("application/pdf")).toBe(false);
    expect(isPreviewableImage(null)).toBe(false);
  });
});

describe("<AddLinkDialog />", () => {
  function renderDialog() {
    const props = { onOpenChange: vi.fn(), onAdded: vi.fn() };
    render(<AddLinkDialog open={true} locationId="loc-1" {...props} />);
    return props;
  }

  it("posts the link, hands back the new attachment and closes", async () => {
    const props = renderDialog();
    const created = { ...base, attachmentType: "link", url: "https://x.test" };
    mockFetch.mockResolvedValue(jsonResp(created));
    await userEvent.type(screen.getByLabelText(/linkUrl/), "https://x.test");
    await userEvent.type(screen.getByLabelText(/linkLabel/), "Portal");
    await userEvent.click(screen.getByRole("button", { name: "addLinkSubmit" }));

    expect(mockFetch).toHaveBeenCalledWith("/api/attachments", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ url: "https://x.test", label: "Portal", description: null, locationId: "loc-1" }),
    }));
    expect(props.onAdded).toHaveBeenCalledWith(created);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledWith({ title: "linked" });
  });

  it("keeps the dialog open and toasts when the request fails", async () => {
    const props = renderDialog();
    mockFetch.mockResolvedValue(jsonResp({ error: "Bad URL" }, false, 400));
    await userEvent.type(screen.getByLabelText(/linkUrl/), "https://x.test");
    await userEvent.type(screen.getByLabelText(/linkLabel/), "Portal");
    await userEvent.click(screen.getByRole("button", { name: "addLinkSubmit" }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Bad URL", variant: "destructive" }));
    expect(props.onAdded).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});

describe("<EditAttachmentDialog />", () => {
  it("starts from the attachment's values and saves trimmed ones (URL only for links)", async () => {
    const link: Attachment = { ...base, attachmentType: "link", displayName: "Old", description: "d", url: "https://a.test" };
    const onSaved = vi.fn();
    const onClose = vi.fn();
    mockFetch.mockResolvedValue(jsonResp({ ...link, displayName: "New" }));
    render(<EditAttachmentDialog attachment={link} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByLabelText(/linkUrl/)).toHaveValue("https://a.test");
    const name = screen.getByLabelText("displayName");
    expect(name).toHaveValue("Old");
    await userEvent.clear(name);
    await userEvent.type(name, "  New ");
    await userEvent.clear(screen.getByLabelText("descriptionLabel"));
    await userEvent.click(screen.getByRole("button", { name: "saveChanges" }));

    expect(mockFetch).toHaveBeenCalledWith("/api/attachments/att-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ displayName: "New", description: null, url: "https://a.test" }),
    }));
    expect(onSaved).toHaveBeenCalledWith({ ...link, displayName: "New" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has no URL field for a file", () => {
    render(<EditAttachmentDialog attachment={base} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/linkUrl/)).toBeNull();
  });
});

describe("<AttachmentLightbox />", () => {
  const images: Attachment[] = [
    { ...base, id: "i1", originalName: "one.jpg" },
    { ...base, id: "i2", originalName: "two.jpg", description: "Second" },
  ];

  function Harness({ start }: { start: string | null }) {
    const [openId, setOpenId] = useState<string | null>(start);
    return <AttachmentLightbox images={images} openId={openId} onOpenIdChange={setOpenId} />;
  }

  it("is closed without an open id", () => {
    render(<Harness start={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cycles with the buttons and the arrow keys, wrapping around", async () => {
    render(<Harness start="i1" />);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByText("1 / 2")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "previous" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});

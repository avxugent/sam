import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = Object.assign(
  (key: string, values?: { name?: string }) => (values?.name ? `${key}:${values.name}` : key),
  { rich: (key: string) => key },
);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
vi.mock("@/components/ui/use-toast", () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import type { Attachment } from "@/components/attachments/attachment";
import { useToast } from "@/components/ui/use-toast";

const toast = vi.mocked(useToast)().toast as ReturnType<typeof vi.fn>;

const uploaded = (name: string, extra: Partial<Attachment> = {}): Attachment => ({
  id: name,
  attachmentType: "file",
  originalName: name,
  mimeType: "application/pdf",
  createdAt: "2026-01-01T00:00:00.000Z",
  uploadedBy: { id: "u1", name: "Ada" },
  ...extra,
});

function Parent({ initial = [uploaded("existing.pdf")], canEdit = true }: { initial?: Attachment[]; canEdit?: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>(initial);
  return <AttachmentGallery attachments={attachments} assetId="a1" canEdit={canEdit} onUpdate={setAttachments} />;
}

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentGallery", () => {
  it("keeps every file of a multi-file upload in the list", async () => {
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const file = (init.body as FormData).get("file") as File;
      return jsonResponse(201, uploaded(file.name));
    });
    const { container } = render(<Parent />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(input, [
      new File(["a"], "one.pdf", { type: "application/pdf" }),
      new File(["b"], "two.pdf", { type: "application/pdf" }),
    ]);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    for (const name of ["existing.pdf", "one.pdf", "two.pdf"]) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
    const form = mockFetch.mock.calls[0][1].body as FormData;
    expect(form.get("assetId")).toBe("a1");
  });

  it("shows a toast naming the file when an upload fails, and keeps the list", async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, { error: "Bad type" }));
    const { container } = render(<Parent />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(input, new File(["a"], "bad.pdf", { type: "application/pdf" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "uploadFailed", description: "Bad type", variant: "destructive" }),
      ),
    );
    expect(screen.queryByText("bad.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("existing.pdf")).toBeInTheDocument();
  });

  it("uploads files dropped on the drop zone", async () => {
    mockFetch.mockResolvedValue(jsonResponse(201, uploaded("dropped.pdf")));
    render(<Parent />);
    const zone = screen.getByText("allowedFilesHint").closest("div")!.parentElement!;

    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["a"], "dropped.pdf", { type: "application/pdf" })] } });

    expect(await screen.findByText("dropped.pdf")).toBeInTheDocument();
  });

  it("names each row action after the attachment through the translations", () => {
    render(<Parent />);
    expect(screen.getByRole("button", { name: "downloadNamed:existing.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "editNamed:existing.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "deleteAttachmentNamed:existing.pdf" })).toBeInTheDocument();
    expect(screen.getByText("allowedFilesHint")).toBeInTheDocument();
  });

  it("opens the file in a new tab from the download button", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<Parent />);
    await userEvent.click(screen.getByRole("button", { name: "downloadNamed:existing.pdf" }));
    expect(open).toHaveBeenCalledWith("/api/attachments/existing.pdf", "_blank");
    open.mockRestore();
  });

  it("removes the attachment after a confirmed delete", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    render(<Parent />);

    await userEvent.click(screen.getByRole("button", { name: "deleteAttachmentNamed:existing.pdf" }));
    expect(screen.getByText("deleteConfirmTitle")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => expect(screen.queryByText("existing.pdf")).not.toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/attachments/existing.pdf", expect.objectContaining({ method: "DELETE" }));
    expect(toast).toHaveBeenCalledWith({ title: "deleted" });
    expect(screen.getByText("noAttachments")).toBeInTheDocument();
  });

  it("keeps the attachment and shows the server's error when the delete fails", async () => {
    mockFetch.mockResolvedValue(jsonResponse(403, { error: "Forbidden" }));
    render(<Parent />);

    await userEvent.click(screen.getByRole("button", { name: "deleteAttachmentNamed:existing.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "error", description: "Forbidden", variant: "destructive" })),
    );
    expect(screen.getByText("existing.pdf")).toBeInTheDocument();
  });

  it("shows a link row with its URL, label and the link delete wording", async () => {
    const link = uploaded("l1", {
      attachmentType: "link",
      originalName: "https://docs.example",
      displayName: "Docs",
      url: "https://docs.example",
      mimeType: null,
      description: "Vendor manual",
    });
    render(<Parent initial={[link]} />);

    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://docs.example");
    expect(screen.getByText("https://docs.example")).toBeInTheDocument();
    expect(screen.getByText("Vendor manual")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "downloadNamed:Docs" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "deleteLinkNamed:Docs" }));
    expect(screen.getByText("deleteLinkTitle")).toBeInTheDocument();
  });

  it("opens the add-link dialog from the add link button", async () => {
    render(<Parent />);
    await userEvent.click(screen.getByRole("button", { name: "addLink" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/linkUrl/)).toBeInTheDocument();
  });

  it("opens the edit dialog for the chosen attachment and applies the saved change", async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, uploaded("existing.pdf", { displayName: "Renamed" })));
    render(<Parent />);

    await userEvent.click(screen.getByRole("button", { name: "editNamed:existing.pdf" }));
    expect(await screen.findByText("editAttachment")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "saveChanges" }));

    expect(await screen.findByText("Renamed")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/attachments/existing.pdf", expect.objectContaining({ method: "PUT" }));
  });

  it("opens previewable images in the lightbox", async () => {
    render(<Parent initial={[uploaded("photo.png", { mimeType: "image/png" })]} />);

    await userEvent.click(screen.getByRole("button", { name: "previewAlt:photo.png" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("photo.png");
    expect(screen.getByRole("img", { name: "previewAlt:photo.png" })).toBeInTheDocument();
  });

  it("hides the upload zone and row edits for read-only users, and shows the empty state", () => {
    render(<Parent initial={[]} canEdit={false} />);
    expect(screen.getByText("noAttachments")).toBeInTheDocument();
    expect(screen.queryByText("allowedFilesHint")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "addLink" })).not.toBeInTheDocument();
  });
});

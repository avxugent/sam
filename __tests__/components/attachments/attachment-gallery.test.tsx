import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const tFn = Object.assign(
  (key: string, values?: { name?: string }) => (values?.name ? `${key}:${values.name}` : key),
  { rich: (key: string) => key },
);
vi.mock("next-intl", () => ({ useTranslations: () => tFn }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import type { Attachment } from "@/components/attachments/attachment";

const uploaded = (name: string): Attachment => ({
  id: name,
  originalName: name,
  mimeType: "application/pdf",
  createdAt: "2026-01-01T00:00:00.000Z",
  uploadedBy: { id: "u1", name: "Ada" },
});

function Parent() {
  const [attachments, setAttachments] = useState<Attachment[]>([uploaded("existing.pdf")]);
  return <AttachmentGallery attachments={attachments} assetId="a1" canEdit onUpdate={setAttachments} />;
}

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentGallery", () => {
  it("keeps every file of a multi-file upload in the list", async () => {
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const file = (init.body as FormData).get("file") as File;
      return { ok: true, json: async () => uploaded(file.name) } as Response;
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
  });

  it("names each row action after the attachment through the translations", () => {
    render(<Parent />);
    expect(screen.getByRole("button", { name: "downloadNamed:existing.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "editNamed:existing.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "deleteAttachmentNamed:existing.pdf" })).toBeInTheDocument();
    expect(screen.getByText("allowedFilesHint")).toBeInTheDocument();
  });
});

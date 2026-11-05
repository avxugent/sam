import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiFetch: vi.fn(),
}));

import { CoverImagePicker } from "@/components/locations/cover-image-picker";
import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const ATTACHMENTS = [
  { id: "img1", originalName: "front.jpg", mimeType: "image/jpeg", size: 10 },
  { id: "doc1", originalName: "manual.pdf", mimeType: "application/pdf", size: 10 },
  { id: "img2", originalName: "rack.png", mimeType: "image/png", size: 10 },
];

function renderPicker(currentCoverImageId: string | null = null, attachments = ATTACHMENTS) {
  const onUpdate = vi.fn();
  render(<CoverImagePicker locationId="loc1" attachments={attachments} currentCoverImageId={currentCoverImageId} onUpdate={onUpdate} />);
  return onUpdate;
}

const imageButton = (name: string) => screen.getByRole("button", { name: new RegExp(name) });
const sentBody = () => JSON.parse(mockApiFetch.mock.calls[0][1]!.body as string);

beforeEach(() => vi.clearAllMocks());

describe("CoverImagePicker", () => {
  it("shows the empty state when no attachment is an image", () => {
    renderPicker(null, [ATTACHMENTS[1]]);
    expect(screen.getByText("noImages")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers only image attachments", () => {
    renderPicker();
    expect(screen.getByRole("img", { name: "front.jpg" })).toHaveAttribute("src", "/api/attachments/img1");
    expect(screen.getByRole("img", { name: "rack.png" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "manual.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /removeCover/ })).not.toBeInTheDocument();
  });

  it("marks the current cover and offers to remove it", () => {
    renderPicker("img2");
    expect(imageButton("rack.png")).toHaveTextContent("currentCover");
    expect(imageButton("front.jpg")).not.toHaveTextContent("currentCover");
    expect(screen.getByRole("button", { name: /removeCover/ })).toBeInTheDocument();
  });

  it("saves a picked image as the cover", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: {} });
    const onUpdate = renderPicker();
    await userEvent.click(imageButton("front.jpg"));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("img1"));
    expect(mockApiFetch.mock.calls[0][0]).toBe("/api/locations/loc1");
    expect(mockApiFetch.mock.calls[0][1]!.method).toBe("PUT");
    expect(sentBody()).toEqual({ coverImageId: "img1" });
    expect(mockToast).toHaveBeenCalledWith({ title: "saved" });
    expect(imageButton("front.jpg")).toHaveTextContent("currentCover");
  });

  it("clicking the current cover clears it", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: {} });
    const onUpdate = renderPicker("img1");
    await userEvent.click(imageButton("front.jpg"));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(null));
    expect(sentBody()).toEqual({ coverImageId: null });
    expect(screen.queryByRole("button", { name: /removeCover/ })).not.toBeInTheDocument();
  });

  it("the remove button clears the cover", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, data: {} });
    const onUpdate = renderPicker("img2");
    await userEvent.click(screen.getByRole("button", { name: /removeCover/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(null));
    expect(sentBody()).toEqual({ coverImageId: null });
  });

  it("keeps the selection and toasts on a failed save", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403, error: { error: "Forbidden" } });
    const onUpdate = renderPicker("img2");
    await userEvent.click(imageButton("front.jpg"));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "error", description: "Forbidden", variant: "destructive" })),
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(imageButton("rack.png")).toHaveTextContent("currentCover");
    expect(imageButton("front.jpg")).toBeEnabled();
  });

  it("disables every choice while saving", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof apiFetch>>) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPicker("img1");
    await userEvent.click(imageButton("front.jpg"));
    expect(imageButton("front.jpg")).toBeDisabled();
    expect(imageButton("rack.png")).toBeDisabled();
    expect(screen.getByRole("button", { name: /removeCover/ })).toBeDisabled();
    expect(imageButton("front.jpg")).toHaveAttribute("aria-busy", "true");
    expect(imageButton("rack.png")).toHaveAttribute("aria-busy", "false");
    resolve({ ok: true, status: 200, data: {} });
    await waitFor(() => expect(imageButton("rack.png")).toBeEnabled());
  });
});

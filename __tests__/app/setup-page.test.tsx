import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiFetch: vi.fn(),
}));

import SetupPage from "@/app/setup/page";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

const push = vi.fn();
const mockApiFetch = vi.mocked(apiFetch);

function fill(values: { name?: string; email?: string; password?: string; confirm?: string }) {
  const fields = { name: "name", email: "email", password: "password", confirm: "confirmPassword" } as const;
  for (const [key, label] of Object.entries(fields)) {
    const value = values[key as keyof typeof values];
    if (value !== undefined) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "submit" }).closest("form")!);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ push } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("setup page", () => {
  it("rejects mismatched passwords without calling the API", async () => {
    render(<SetupPage />);
    fill({ name: "Admin", email: "a@example.com", password: "longpassword", confirm: "different1" });
    submit();
    expect(await screen.findByText("passwordMismatch")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters without calling the API", async () => {
    render(<SetupPage />);
    fill({ name: "Admin", email: "a@example.com", password: "short", confirm: "short" });
    submit();
    expect(await screen.findByText("passwordTooShort")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("shows the server's error message when setup fails", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403, error: { error: "Setup already completed" } });
    render(<SetupPage />);
    fill({ name: "Admin", email: "a@example.com", password: "longpassword", confirm: "longpassword" });
    submit();
    expect(await screen.findByText("Setup already completed")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "submit" })).toBeEnabled();
  });

  it("falls back to the generic failure text when the error has no message", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 0, error: {} });
    render(<SetupPage />);
    fill({ name: "Admin", email: "a@example.com", password: "longpassword", confirm: "longpassword" });
    submit();
    expect(await screen.findByText("failed")).toBeInTheDocument();
  });

  it("posts the admin account, shows completion and goes to /login after two seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiFetch.mockResolvedValue({ ok: true, status: 201, data: {} });
    render(<SetupPage />);
    fill({ name: "Admin", email: "a@example.com", password: "longpassword", confirm: "longpassword" });
    submit();

    expect(await screen.findByText("complete")).toBeInTheDocument();
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe("/api/setup");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ name: "Admin", email: "a@example.com", password: "longpassword" });
    expect(push).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("clears a previous error on resubmit", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 0, error: {} });
    render(<SetupPage />);
    fill({ name: "Admin", email: "a@example.com", password: "short", confirm: "short" });
    submit();
    expect(await screen.findByText("passwordTooShort")).toBeInTheDocument();

    fill({ password: "longpassword", confirm: "longpassword" });
    submit();
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.queryByText("passwordTooShort")).not.toBeInTheDocument();
  });
});

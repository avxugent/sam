import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import GlobalError from "@/app/error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error boundary page", () => {
  it("logs the error and retries through reset", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const error = new Error("boom");

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "somethingWentWrong" })).toBeInTheDocument();
    expect(screen.getByText("unexpectedError")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith("Unhandled error:", error);

    await userEvent.click(screen.getByRole("button", { name: "tryAgain" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

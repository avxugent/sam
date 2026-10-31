import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";

/**
 * Shared helpers for server page tests. The pages are async server
 * components: call the default export, await the element, then render it so
 * the mocked client components receive their props.
 */

export function session(role: Role, id = "user-1") {
  return { user: { id, role, name: "Test User", email: "test@example.com" } };
}

export async function renderPage(page: Promise<ReactElement>) {
  render(await page);
}

/** Props of the n-th render of a component mocked with vi.fn(() => null). */
export function propsOf(component: unknown, call = 0): Record<string, unknown> {
  const calls = vi.mocked(component as (props: Record<string, unknown>) => null).mock.calls;
  expect(calls.length).toBeGreaterThan(call);
  return calls[call][0];
}

export const NON_ADMIN_ROLES = ["VIEWER", "EDITOR", "MAINTAINER"] as const satisfies readonly Role[];
export const NON_CATALOG_ROLES = ["VIEWER", "EDITOR"] as const satisfies readonly Role[];

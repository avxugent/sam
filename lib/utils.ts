import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Avatar initials: first + last word of the name, else its first two letters, else the email's first letter. */
export function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? "U").toUpperCase();
}

/** UTC calendar day as YYYY-MM-DD — the format of date inputs, CSV exports and audit diffs. */
export function toIsoDay(date: Date | string | number): string;
export function toIsoDay(date: Date | string | number | null | undefined): string | null;
export function toIsoDay(date: Date | string | number | null | undefined): string | null {
  return date == null ? null : new Date(date).toISOString().slice(0, 10);
}

/**
 * User-facing text for an API error body. Routes return `{ error }` plus, for
 * template and pattern checks, `details: string[]` with the specific problems;
 * Zod's structured `details` object is not meant for display and is ignored.
 */
export function apiErrorMessage(body: { error?: string; details?: unknown }, fallback = ""): string {
  const details = Array.isArray(body.details) ? body.details.filter((d): d is string => typeof d === "string") : [];
  const message = body.error ?? fallback;
  return details.length > 0 ? `${message}: ${details.join("; ")}` : message;
}

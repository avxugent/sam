import "@testing-library/jest-dom";
import { vi } from "vitest";

// Polyfill for Next.js server internals used by route handlers
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
// @ts-expect-error — Node's TextDecoder is compatible enough for tests
global.TextDecoder = TextDecoder;

// Silence console.warn in tests unless explicitly needed
// (keeps test output clean; individual tests can still spy on console)
vi.spyOn(console, "warn").mockImplementation(() => {});

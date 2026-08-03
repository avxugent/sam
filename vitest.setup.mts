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

// jsdom doesn't implement the Pointer Events capture APIs or scrollIntoView,
// which Radix UI's Select/Dialog/etc. call when a trigger is clicked — tests
// interacting with those components would otherwise throw. Guarded because
// some test files run in the "node" environment, where `Element` doesn't exist.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

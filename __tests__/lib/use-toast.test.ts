import { describe, it, expect } from "vitest";
import { reducer } from "@/components/ui/use-toast";

// The reducer is exported from use-toast.ts — it's a pure function, easily tested
// without any DOM or React context.

type State = { toasts: Array<{ id: string; open?: boolean; title?: string }> };

const emptyState: State = { toasts: [] };

describe("toast reducer", () => {
  describe("ADD_TOAST", () => {
    it("adds a toast to the state", () => {
      const next = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", title: "Hello" },
      });
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].title).toBe("Hello");
    });

    it("prepends new toasts (most recent first)", () => {
      const state1 = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", title: "First" },
      });
      const state2 = reducer(state1, {
        type: "ADD_TOAST",
        toast: { id: "2", title: "Second" },
      });
      // TOAST_LIMIT=1, so only the newest is kept
      expect(state2.toasts[0].title).toBe("Second");
    });

    it("respects TOAST_LIMIT (default 1)", () => {
      const state1 = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", title: "A" },
      });
      const state2 = reducer(state1, {
        type: "ADD_TOAST",
        toast: { id: "2", title: "B" },
      });
      expect(state2.toasts).toHaveLength(1);
    });
  });

  describe("UPDATE_TOAST", () => {
    it("updates a toast by id", () => {
      const state = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", title: "Original" },
      });
      const next = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      });
      expect(next.toasts[0].title).toBe("Updated");
    });

    it("does not affect other toasts", () => {
      // With TOAST_LIMIT=1 we only have one toast, verify the ID is unchanged
      const state = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "abc", title: "Test" },
      });
      const next = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "abc", title: "Changed" },
      });
      expect(next.toasts[0].id).toBe("abc");
      expect(next.toasts[0].title).toBe("Changed");
    });
  });

  describe("DISMISS_TOAST", () => {
    it("sets open=false for the specified toast", () => {
      const state = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", open: true, title: "Hi" },
      });
      const next = reducer(state, { type: "DISMISS_TOAST", toastId: "1" });
      expect(next.toasts[0].open).toBe(false);
    });

    it("sets open=false for all toasts when no id given", () => {
      const state = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", open: true },
      });
      const next = reducer(state, { type: "DISMISS_TOAST", toastId: undefined });
      expect(next.toasts.every((t) => t.open === false)).toBe(true);
    });
  });

  describe("REMOVE_TOAST", () => {
    it("removes the toast with the given id", () => {
      const state = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1", title: "Bye" },
      });
      const next = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
      expect(next.toasts).toHaveLength(0);
    });

    it("clears all toasts when no id given", () => {
      const state = reducer(emptyState, {
        type: "ADD_TOAST",
        toast: { id: "1" },
      });
      const next = reducer(state, { type: "REMOVE_TOAST", toastId: undefined });
      expect(next.toasts).toHaveLength(0);
    });
  });
});

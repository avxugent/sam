import type { LifecycleViolationCode } from "@/lib/assets/lifecycle-rules";

/**
 * The response of the bulk endpoints (decommission, return to stock, stock
 * relocate). Each skip reason is translated on the client
 * (decommissioned.bulkSkipReason.*). The single-asset lifecycle routes send
 * the same identifiers as their error `code`. Client-safe.
 */
export type BulkSkipReason = LifecycleViolationCode | "STATUS_CHANGED" | "NOT_FOUND";
export type BulkFailure = { id: string; reason: BulkSkipReason };
export type BulkResult = { succeeded: string[]; failed: BulkFailure[] };

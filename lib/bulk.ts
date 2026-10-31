import type { LifecycleViolationCode } from "@/lib/assets/lifecycle-rules";

/**
 * The response of the bulk endpoints (decommission, return to stock, stock
 * relocate). Each skip reason is translated on the client
 * (decommissioned.bulkSkipReason.*). Client-safe.
 */
export type BulkSkipReason = LifecycleViolationCode | "STATUS_CHANGED" | "NOT_FOUND";
export type BulkFailure = { id: string; reason: BulkSkipReason };
export type BulkResult = { succeeded: string[]; failed: BulkFailure[] };

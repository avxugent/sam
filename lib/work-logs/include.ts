import type { Prisma } from "@/generated/prisma/client";

/** Relations of every work log entry: the work-log API routes and the location page. */
export const WORK_LOG_INCLUDE = {
  performedBy: { select: { id: true, name: true, email: true } },
  item: { select: { id: true, name: true } },
  asset: {
    select: {
      id: true,
      model: { select: { name: true } },
      serialNumber: true,
      hostname: true,
      type: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.WorkLogInclude;

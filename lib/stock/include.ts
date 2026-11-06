import type { Prisma } from "@/generated/prisma/client";

/** Relations of a stock item as the stock table and form expect it; the stock page and the stock create/update endpoints return this shape. */
export const STOCK_ITEM_ROW_INCLUDE = {
  type: true,
  manufacturer: true,
  model: true,
  location: { select: { id: true, name: true } },
} satisfies Prisma.StockItemInclude;

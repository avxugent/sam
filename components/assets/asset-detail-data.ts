import type { Attachment } from "@/components/attachments/attachment";
import type { AssetDetail } from "@/lib/assets/include";

type AssetDateField =
  | "installationDate"
  | "invoiceDate"
  | "endOfSupportDate"
  | "decommissionedAt"
  | "repairStartedAt"
  | "createdAt"
  | "updatedAt";

/** The detail page's asset with its dates as ISO strings (the server → client convention). */
export type AssetDetailData = Omit<AssetDetail, AssetDateField | "attachments"> & {
  [K in AssetDateField]: null extends AssetDetail[K] ? string | null : string;
} & { attachments: Attachment[] };

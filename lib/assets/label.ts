/**
 * The name an asset goes by in the UI and the audit log: its model, else its
 * hostname, else its serial number (empty strings skipped). Null when it has
 * none of them; the caller picks the fallback. Client-safe.
 */
export function assetLabel(asset: {
  model?: { name: string } | null;
  hostname?: string | null;
  serialNumber?: string | null;
}): string | null {
  return asset.model?.name || asset.hostname || asset.serialNumber || null;
}

export function renderHostnameUrl(
  template: string,
  asset: {
    hostname?: string | null;
    serialNumber?: string | null;
    model?: string | null;
    manufacturer?: { name: string } | null;
  }
): string {
  return template
    .replaceAll("{hostname}", asset.hostname ?? "")
    .replaceAll("{serial}", asset.serialNumber ?? "")
    .replaceAll("{model}", asset.model ?? "")
    .replaceAll("{manufacturer}", asset.manufacturer?.name ?? "");
}

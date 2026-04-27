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

export function renderMacAddressUrl(template: string, mac: string): string {
  const plain = mac.replace(/[:\-\.]/g, "").toLowerCase();
  const colon = plain.match(/.{2}/g)?.join(":") ?? mac;
  const dash = plain.match(/.{2}/g)?.join("-") ?? mac;
  return template
    .replaceAll("{mac}", colon)
    .replaceAll("{mac_plain}", plain)
    .replaceAll("{mac_dash}", dash);
}

export function renderHostnameUrl(
  template: string,
  asset: {
    hostname?: string | null;
    serialNumber?: string | null;
    model?: { name: string } | null;
    manufacturer?: { name: string } | null;
  }
): string {
  return template
    .replaceAll("{hostname}", asset.hostname ?? "")
    .replaceAll("{serial}", asset.serialNumber ?? "")
    .replaceAll("{model}", asset.model?.name ?? "")
    .replaceAll("{manufacturer}", asset.manufacturer?.name ?? "");
}

/**
 * Renders the admin-configured location URL template.
 *
 * A location without an FI number has nothing to identify a room by in an
 * external system, so callers should treat an empty {fi_number} as "no link"
 * rather than producing a URL that resolves to nothing.
 */
export function renderLocationUrl(
  template: string,
  location: {
    fiNumber?: string | null;
    name?: string | null;
    id?: string | null;
  }
): string {
  return template
    .replaceAll("{fi_number}", location.fiNumber ?? "")
    .replaceAll("{location_name}", location.name ?? "")
    .replaceAll("{location_id}", location.id ?? "");
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

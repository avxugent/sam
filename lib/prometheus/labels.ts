import { buildLocationPathString, findFiNumber, parseFiNumber, type LocationAncestor } from "@/lib/locations/path";

/**
 * The sam_* labels shared by /api/prometheus/sd (target-group labels) and
 * /api/prometheus/metrics (sam_asset_info). Grafana joins the two on
 * sam_hostname, so both build them here. Values are "" when unknown; SD drops
 * the empty optional ones, metrics keeps every key so series shapes stay stable.
 */

/** Location labels from the root → leaf ancestor chain (the leaf is the room). */
export function samLocationLabels(ancestors: Pick<LocationAncestor, "name" | "fiNumber">[]) {
  const fiNumber = findFiNumber(ancestors);
  const parts = parseFiNumber(fiNumber);
  // Key order is the order labels appear in the metrics exposition.
  return {
    sam_fi_number: fiNumber ?? "",
    sam_campus: parts?.campus ?? "",
    sam_building: parts?.building ?? "",
    sam_floor: parts?.floor ?? "",
    sam_room: parts?.room ?? "",
    sam_location_path: buildLocationPathString(ancestors),
    sam_location_name: ancestors.at(-1)?.name ?? "",
  };
}

export function samAssetLabels(
  asset: {
    hostname: string;
    type?: { name: string } | null;
    manufacturer?: { name: string } | null;
    model?: { name: string } | null;
  },
  ancestors: Pick<LocationAncestor, "name" | "fiNumber">[]
) {
  return {
    sam_hostname: asset.hostname,
    ...samLocationLabels(ancestors),
    sam_asset_type: asset.type?.name ?? "",
    sam_manufacturer: asset.manufacturer?.name ?? "",
    sam_model: asset.model?.name ?? "",
  };
}

export type SamAssetLabels = ReturnType<typeof samAssetLabels>;

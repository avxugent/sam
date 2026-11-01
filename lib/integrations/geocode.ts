/**
 * OpenStreetMap Nominatim address search — zero external dependencies.
 *
 * Nothing here throws: a timeout, network failure, error status or non-JSON
 * body are all reported as "unavailable".
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MAX_RESULTS = 5;

/** A hung geocoder must not hang the request: give up and report "unavailable". */
const REQUEST_TIMEOUT_MS = 10_000;

/** Nominatim's result objects, passed through unchanged to the location map. */
export type GeocodeLookup =
  | { status: "found"; results: unknown[] }
  | { status: "unavailable" };

export async function geocodeAddress(query: string): Promise<GeocodeLookup> {
  const url = `${NOMINATIM_URL}?format=json&addressdetails=1&limit=${MAX_RESULTS}&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "SAM/2 (UGent internal asset management)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[geocode] HTTP ${res.status} from Nominatim`);
      return { status: "unavailable" };
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      console.warn("[geocode] Nominatim answered without a result list");
      return { status: "unavailable" };
    }
    return { status: "found", results: body };
  } catch (err) {
    console.warn("[geocode] request failed:", err instanceof Error ? err.message : err);
    return { status: "unavailable" };
  }
}

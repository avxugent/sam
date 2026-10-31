"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPin, Search, Save, ExternalLink } from "lucide-react";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type Props = {
  locationId: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  canEdit: boolean;
  onUpdate: (data: {
    address?: string;
    city?: string;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => void;
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country?: string;
  };
};

export function LocationMap({
  locationId,
  address: initAddress,
  city: initCity,
  country: initCountry,
  latitude: initLat,
  longitude: initLng,
  canEdit,
  onUpdate,
}: Props) {
  const t = useTranslations("location");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const [address, setAddress] = useState(initAddress || "");
  const [city, setCity] = useState(initCity || "");
  const [country, setCountry] = useState(initCountry || "");
  const [lat, setLat] = useState<number | null>(initLat ?? null);
  const [lng, setLng] = useState<number | null>(initLng ?? null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);

  const hasCoords = lat !== null && lng !== null;

  async function handleSearch() {
    const query = [address, city, country].filter(Boolean).join(", ");
    if (!query) {
      toast({ title: t("mapAddress"), variant: "destructive" });
      return;
    }
    setSearching(true);
    setSearchResults([]);
    const res = await apiFetch<NominatimResult[]>(`/api/geocode?q=${encodeURIComponent(query)}`);
    setSearching(false);
    if (!res.ok || !Array.isArray(res.data)) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.ok ? {} : res.error, t("geocodeFailed")), variant: "destructive" });
      return;
    }
    setSearchResults(res.data);
    if (res.data.length === 0) {
      toast({ title: t("geocodeNoResults"), description: t("geocodeNoResultsHint") });
    }
  }

  function applyResult(result: NominatimResult) {
    const newLat = parseFloat(result.lat);
    const newLng = parseFloat(result.lon);
    setLat(newLat);
    setLng(newLng);
    setSearchResults([]);

    // Optionally auto-fill city/country from result
    const a = result.address;
    const detectedCity = a.city || a.town || a.village || a.municipality || "";
    const detectedCountry = a.country || "";
    if (!city && detectedCity) setCity(detectedCity);
    if (!country && detectedCountry) setCountry(detectedCountry);
  }

  async function handleSave() {
    setSaving(true);
    const res = await apiFetch(`/api/locations/${locationId}`, jsonBody("PUT", {
        address: address || null,
        city: city || null,
        country: country || null,
        latitude: lat,
        longitude: lng,
      }));
    setSaving(false);

    if (!res.ok) {
      showApiError(res.error);
      return;
    }

    toast({ title: t("locationUpdated") });
    onUpdate({ address, city, country, latitude: lat, longitude: lng });
  }

  // Build the OSM iframe embed URL
  const mapSrc = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng! - 0.005},${lat! - 0.003},${lng! + 0.005},${lat! + 0.003}&layer=mapnik&marker=${lat},${lng}`
    : null;

  const osmLink = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
    : null;

  return (
    <div className="space-y-5">
      {canEdit ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{tField("streetAddress")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tField("city")}</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("cityPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tField("country")}</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t("countryPlaceholder")}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSearch}
              disabled={searching}
            >
              {searching ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              {t("mapAddress")}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="border rounded-lg divide-y overflow-hidden">
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                {t("pickGeocodeResult")}
              </p>
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 flex items-start gap-2"
                  onClick={() => applyResult(r)}
                >
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span>{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Read-only address display */
        (address || city || country) && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              {address && <p>{address}</p>}
              <p className="text-muted-foreground">
                {[city, country].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        )
      )}

      {hasCoords && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {lat!.toFixed(6)}, {lng!.toFixed(6)}
          </span>
          {osmLink && (
            <a
              href={osmLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline ml-1"
            >
              {t("openInOsm")}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Map embed */}
      {mapSrc ? (
        <div className="rounded-lg overflow-hidden border" style={{ height: 380 }}>
          <iframe
            src={mapSrc}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            title={t("mapFrameTitle")}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 flex flex-col items-center justify-center gap-3 text-muted-foreground"
          style={{ height: 280 }}>
          <MapPin className="h-10 w-10 opacity-30" />
          <p className="text-sm">
            {canEdit
              ? t("mapAddress")
              : t("noMapAddress")}
          </p>
        </div>
      )}
    </div>
  );
}

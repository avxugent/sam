"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, MapPin, Search, Save, ExternalLink } from "lucide-react";

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
  const { toast } = useToast();
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
      toast({ title: "Enter an address to search", variant: "destructive" });
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`,
        { headers: { "Accept-Language": "en" } }
      );
      const data: NominatimResult[] = await res.json();
      setSearchResults(data);
      if (data.length === 0) {
        toast({ title: "No results found", description: "Try a more specific address." });
      }
    } catch {
      toast({ title: "Search failed", description: "Could not reach geocoding service.", variant: "destructive" });
    }
    setSearching(false);
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
    const res = await fetch(`/api/locations/${locationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address || null,
        city: city || null,
        country: country || null,
        latitude: lat,
        longitude: lng,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }

    toast({ title: "Location saved" });
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
      {/* Address form */}
      {canEdit ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Street address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Grote Markt 1"
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Ghent"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Belgium"
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
              Find on map
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
              Save address
            </Button>
          </div>

          {/* Geocode results */}
          {searchResults.length > 0 && (
            <div className="border rounded-lg divide-y overflow-hidden">
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                Select a result to pin on map
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

      {/* Coordinate display */}
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
              Open in OpenStreetMap
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
            title="Location map"
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
              ? "Enter an address and click \"Find on map\" to pin this location."
              : "No location coordinates set."}
          </p>
        </div>
      )}
    </div>
  );
}

import { serveBrandingAsset } from "@/lib/branding-assets";

export async function GET() {
  return serveBrandingAsset("logo");
}

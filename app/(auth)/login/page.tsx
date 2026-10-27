import { LoginClient } from "@/components/auth/login-client";
import { ssoEnabled } from "@/lib/auth";
import { readSettings } from "@/lib/app-settings";

export default async function LoginPage() {
  const map = await readSettings(["app.title", "branding.logoStorageKey"]);
  const appTitle = map["app.title"] || "SAM";
  const logoUrl = map["branding.logoStorageKey"] ? "/api/branding/logo" : null;

  return <LoginClient ssoEnabled={ssoEnabled} appTitle={appTitle} logoUrl={logoUrl} />;
}

export const metadata = { title: "Sign in" };

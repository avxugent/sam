import { LoginClient } from "@/components/auth/login-client";
import { ssoEnabled } from "@/lib/auth";
import { readBrandingSettings } from "@/lib/app-settings";

export default async function LoginPage() {
  const { appTitle, hasLogo } = await readBrandingSettings();
  const logoUrl = hasLogo ? "/api/branding/logo" : null;

  return <LoginClient ssoEnabled={ssoEnabled} appTitle={appTitle} logoUrl={logoUrl} />;
}

export const metadata = { title: "Sign in" };

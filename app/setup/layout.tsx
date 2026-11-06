import { AuthShell } from "@/components/auth/auth-shell";
import { readBrandingSettings } from "@/lib/app-settings";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const { appTitle, hasLogo } = await readBrandingSettings();
  return (
    <AuthShell appTitle={appTitle} logoUrl={hasLogo ? "/api/branding/logo" : null}>
      {children}
    </AuthShell>
  );
}

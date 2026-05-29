import { LoginClient } from "@/components/auth/login-client";
import { ssoEnabled } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LoginPage() {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["app.title", "branding.logoStorageKey"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const appTitle = map["app.title"] || "SAM";
  const logoUrl = map["branding.logoStorageKey"] ? "/api/branding/logo" : null;

  return <LoginClient ssoEnabled={ssoEnabled} appTitle={appTitle} logoUrl={logoUrl} />;
}

export const metadata = { title: "Sign in" };

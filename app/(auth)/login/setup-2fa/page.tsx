import { getTranslations } from "next-intl/server";
import { Forced2FASetupClient } from "@/components/auth/forced-2fa-setup-client";

export default function Setup2FAPage() {
  return <Forced2FASetupClient />;
}

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("twoFactorSetupTitle") };
}

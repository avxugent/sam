import { getTranslations } from "next-intl/server";
import { LoginClient } from "@/components/auth/login-client";
import { ssoEnabled } from "@/lib/auth";

export default function LoginPage() {
  return <LoginClient ssoEnabled={ssoEnabled} />;
}

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signInHeading") };
}

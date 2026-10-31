import { getTranslations } from "next-intl/server";
import { ForcedPasswordChangeClient } from "@/components/auth/forced-password-change-client";

export default function ChangePasswordPage() {
  return <ForcedPasswordChangeClient />;
}

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("passwordChangeTitle") };
}

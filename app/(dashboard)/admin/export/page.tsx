import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readExportSettings } from "@/lib/app-settings";
import { ExportClient } from "@/components/admin/data/export-client";
import { isAdmin } from "@/lib/permissions";

export default async function ExportPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const settings = await readExportSettings();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("export.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("export.subtitle")}</p>
      </div>
      <ExportClient
        initialCronExpression={settings.cronExpression}
        initialOutputDir={settings.outputDir}
        initialEnabled={settings.enabled}
      />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("adminPages");
  return { title: t("export.title") };
}

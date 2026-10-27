import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readSettings } from "@/lib/app-settings";
import { ExportClient } from "@/components/admin/export-client";
import { isAdmin } from "@/lib/permissions";

export default async function ExportPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const map = await readSettings(["export.cronExpression", "export.outputDir", "export.enabled"]);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("export.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("export.subtitle")}</p>
      </div>
      <ExportClient
        initialCronExpression={map["export.cronExpression"] ?? "0 2 * * *"}
        initialOutputDir={map["export.outputDir"] ?? "/backups"}
        initialEnabled={map["export.enabled"] === "true"}
      />
    </div>
  );
}

export const metadata = { title: "Export CSV – SAM Admin" };

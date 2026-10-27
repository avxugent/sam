import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ExportClient } from "@/components/admin/export-client";
import { isAdmin } from "@/lib/permissions";

export default async function ExportPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["export.cronExpression", "export.outputDir", "export.enabled"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Export CSV</h1>
        <p className="text-muted-foreground mt-1">
          Download a full CSV export or configure automated backups.
        </p>
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

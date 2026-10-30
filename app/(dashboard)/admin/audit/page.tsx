import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { AuditLogClient } from "@/components/admin/audit-log-client";
import { isAdmin } from "@/lib/permissions";
import type { AuditEntityType } from "@/lib/audit";

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 500,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("audit.subtitle")}</p>
      </div>
      <AuditLogClient
        // Rows are only ever written by logAudit(), whose entityType is an AuditEntityType.
        initialLogs={logs.map((l) => ({ ...l, entityType: l.entityType as AuditEntityType, timestamp: l.timestamp.toISOString() }))}
      />
    </div>
  );
}

export const metadata = { title: "Audit Log – SAM Admin" };

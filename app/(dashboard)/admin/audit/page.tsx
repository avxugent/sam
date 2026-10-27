import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AuditLogClient } from "@/components/settings/audit-log-client";
import { isAdmin } from "@/lib/permissions";

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 500,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          All administrative actions for NIS2 compliance. Showing last 500 entries.
        </p>
      </div>
      <AuditLogClient initialLogs={logs.map((l) => ({ ...l, timestamp: l.timestamp.toISOString() }))} />
    </div>
  );
}

export const metadata = { title: "Audit Log – SAM Admin" };

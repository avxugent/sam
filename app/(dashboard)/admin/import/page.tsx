import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CsvImportClient } from "@/components/import/csv-import-client";
import { isAdmin } from "@/lib/permissions";

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("import.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("import.subtitle")}</p>
      </div>
      <CsvImportClient />
    </div>
  );
}

export const metadata = { title: "Import CSV – SAM Admin" };

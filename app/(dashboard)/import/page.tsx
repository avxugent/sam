import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CsvImportClient } from "@/components/import/csv-import-client";

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Import from CSV</h1>
        <p className="text-muted-foreground mt-1">
          Import assets from a legacy CSV export. Locations, asset types and manufacturers
          are created automatically if they don&apos;t exist yet.
        </p>
      </div>
      <CsvImportClient />
    </div>
  );
}

export const metadata = { title: "Import CSV – SAM" };

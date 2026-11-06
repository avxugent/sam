import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageCatalog, isAdmin } from "@/lib/permissions";

export default async function AdminPage() {
  const session = await auth();
  if (isAdmin(session?.user?.role)) redirect("/admin/users");
  if (canManageCatalog(session?.user?.role)) redirect("/admin/manufacturers");
  redirect("/");
}

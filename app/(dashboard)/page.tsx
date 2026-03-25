import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const firstLocation = await prisma.location.findFirst({
    where: { parentId: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (firstLocation) {
    redirect(`/locations/${firstLocation.id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h1 className="text-2xl font-semibold mb-2">Welcome to SAM</h1>
      <p className="text-muted-foreground">
        No locations yet. Use the sidebar to add your first location.
      </p>
    </div>
  );
}

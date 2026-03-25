import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function LocationsPage() {
  const firstLocation = await prisma.location.findFirst({
    where: { parentId: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (firstLocation) {
    redirect(`/locations/${firstLocation.id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h1 className="text-2xl font-semibold mb-2">No locations yet</h1>
      <p className="text-muted-foreground">Add a location using the sidebar.</p>
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    // Check if setup is needed
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      redirect("/setup");
    }
    redirect("/login");
  }

  // Find the first top-level location to redirect to
  const firstLocation = await prisma.location.findFirst({
    where: { parentId: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  if (firstLocation) {
    redirect(`/locations/${firstLocation.id}`);
  }

  redirect("/locations");
}

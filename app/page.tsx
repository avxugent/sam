import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      redirect("/setup");
    }
    redirect("/login");
  }

  redirect("/locations");
}

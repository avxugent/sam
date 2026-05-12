import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

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

  redirect("/locations");
}

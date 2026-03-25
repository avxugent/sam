import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Check if setup is required
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  const locationTree = await prisma.location.findMany({
    where: { parentId: null },
    include: {
      children: {
        include: {
          children: {
            include: {
              children: {
                include: {
                  _count: { select: { assets: true, children: true } },
                },
              },
              _count: { select: { assets: true, children: true } },
            },
          },
          _count: { select: { assets: true, children: true } },
        },
      },
      _count: { select: { assets: true, children: true } },
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar locationTree={locationTree} userRole={session.user.role} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={session.user} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getModelItems } from "@/lib/model-clusters";
import { computeModelClusters } from "@/lib/model-similarity";
import { ModelCleanupClient } from "@/components/settings/model-cleanup-client";

export default async function ModelCleanupPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const items = await getModelItems();
  const clusters = computeModelClusters(items);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Model Cleanup</h1>
        <p className="text-muted-foreground mt-1">Review and merge similar asset model spellings.</p>
      </div>
      <ModelCleanupClient initialClusters={clusters} initialItems={items} />
    </div>
  );
}

export const metadata = { title: "Model Cleanup – SAM Admin" };

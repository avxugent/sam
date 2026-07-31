import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FirmwareBaselinesClient } from "@/components/settings/firmware-baselines-client";
import { compareVersions, matchBaseline, type Baseline } from "@/lib/firmware";

export default async function FirmwareBaselinesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const [assetTypes, baselines, firmwareAssets] = await Promise.all([
    prisma.assetType.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.firmwareBaseline.findMany({
      orderBy: [{ type: { name: "asc" } }, { model: "asc" }],
      include: { type: { select: { id: true, name: true } } },
    }),
    // What is actually deployed, so baselines can be created from observed
    // versions rather than typed blind.
    prisma.asset.findMany({
      where: { status: "INSTALLED", firmwareVersion: { not: null }, typeId: { not: null } },
      select: { typeId: true, model: true, firmwareVersion: true, type: { select: { name: true } } },
    }),
  ]);

  const baselineList: Baseline[] = baselines.map((b) => ({
    typeId: b.typeId,
    model: b.model,
    approvedVersion: b.approvedVersion,
  }));

  const groups = new Map<
    string,
    {
      typeId: string;
      typeName: string;
      model: string | null;
      assetCount: number;
      versions: Map<string, number>;
    }
  >();

  for (const a of firmwareAssets) {
    const key = `${a.typeId} ${a.model ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        typeId: a.typeId!,
        typeName: a.type!.name,
        model: a.model,
        assetCount: 0,
        versions: new Map(),
      };
      groups.set(key, g);
    }
    g.assetCount++;
    g.versions.set(a.firmwareVersion!, (g.versions.get(a.firmwareVersion!) ?? 0) + 1);
  }

  const observed = Array.from(groups.values())
    .map((g) => {
      const versions = Array.from(g.versions.entries()).map(([version, count]) => ({
        version,
        count,
      }));

      // Highest observed version, using the same comparator the compliance
      // check uses. A version that cannot be ordered never wins, so the
      // suggestion stays conservative rather than proposing something arbitrary.
      let suggestedVersion: string | null = null;
      for (const { version } of versions) {
        if (suggestedVersion === null) {
          suggestedVersion = version;
          continue;
        }
        const cmp = compareVersions(version, suggestedVersion);
        if (cmp !== null && cmp > 0) suggestedVersion = version;
      }

      const existing = matchBaseline(baselineList, g.typeId, g.model);

      return {
        typeId: g.typeId,
        typeName: g.typeName,
        model: g.model,
        assetCount: g.assetCount,
        versions: versions.sort((a, b) => b.count - a.count),
        suggestedVersion,
        coveredBy: existing
          ? { model: existing.model, approvedVersion: existing.approvedVersion }
          : null,
      };
    })
    .sort(
      (a, b) => a.typeName.localeCompare(b.typeName) || (a.model ?? "").localeCompare(b.model ?? "")
    );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Firmware Baselines</h1>
        <p className="text-muted-foreground mt-1">
          The approved firmware version per asset type and model. A device at or above its baseline
          counts as up to date; one with no matching baseline is reported as <em>unclassified</em>{" "}
          rather than compliant, so the NIS2 figures never overstate coverage.
        </p>
      </div>
      <FirmwareBaselinesClient
        baselines={baselines}
        observed={observed}
        assetTypes={assetTypes}
      />
    </div>
  );
}

export const metadata = { title: "Firmware Baselines – SAM Admin" };

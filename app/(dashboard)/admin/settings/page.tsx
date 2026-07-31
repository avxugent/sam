import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GeneralSettingsClient } from "@/components/settings/general-settings-client";
import { BrandingSettingsClient } from "@/components/settings/branding-settings-client";
import { ComplianceSettingsClient } from "@/components/settings/compliance-settings-client";
import { WorkLogItemsManager } from "@/components/settings/work-log-items-manager";
import { FirmwareBaselinesClient } from "@/components/settings/firmware-baselines-client";
import { compareVersions, matchBaseline, type Baseline } from "@/lib/firmware";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "hostname.urlTemplate",
          "macAddress.urlTemplate",
          "location.urlTemplate",
          "app.title",
          "branding.logoStorageKey",
          "branding.faviconStorageKey",
          "branding.backgroundMode",
          "branding.backgroundStorageKey",
          "security.requireTwoFactor",
          "audit.retentionDays",
          "assets.defaultOwnerId",
          "compliance.reviewWorkLogItemId",
          "compliance.reviewPeriodMonths",
        ],
      },
    },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const workLogItems = await prisma.workLogItem.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { workLogs: true } } },
  });

  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const assetTypes = await prisma.assetType.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const firmwareBaselines = await prisma.firmwareBaseline.findMany({
    orderBy: [{ type: { name: "asc" } }, { model: "asc" }],
    include: { type: { select: { id: true, name: true } } },
  });

  // What is actually deployed, so baselines can be created from observed
  // versions rather than typed blind. Mirrors
  // GET /api/firmware-baselines/observed, computed here to avoid a round-trip.
  const firmwareAssets = await prisma.asset.findMany({
    where: { status: "INSTALLED", firmwareVersion: { not: null }, typeId: { not: null } },
    select: { typeId: true, model: true, firmwareVersion: true, type: { select: { name: true } } },
  });

  const baselineList: Baseline[] = firmwareBaselines.map((b) => ({
    typeId: b.typeId,
    model: b.model,
    approvedVersion: b.approvedVersion,
  }));

  const groups = new Map<
    string,
    { typeId: string; typeName: string; model: string | null; assetCount: number; versions: Map<string, number> }
  >();
  for (const a of firmwareAssets) {
    const key = `${a.typeId} ${a.model ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { typeId: a.typeId!, typeName: a.type!.name, model: a.model, assetCount: 0, versions: new Map() };
      groups.set(key, g);
    }
    g.assetCount++;
    g.versions.set(a.firmwareVersion!, (g.versions.get(a.firmwareVersion!) ?? 0) + 1);
  }

  const observed = Array.from(groups.values())
    .map((g) => {
      const versions = Array.from(g.versions.entries()).map(([version, count]) => ({ version, count }));
      // Versions that cannot be ordered never win, so the suggestion stays
      // conservative rather than proposing something arbitrary.
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
        coveredBy: existing ? { model: existing.model, approvedVersion: existing.approvedVersion } : null,
      };
    })
    .sort((a, b) => a.typeName.localeCompare(b.typeName) || (a.model ?? "").localeCompare(b.model ?? ""));

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">General application configuration.</p>
        </div>
        <GeneralSettingsClient
          initialHostnameUrlTemplate={map["hostname.urlTemplate"] ?? ""}
          initialMacAddressUrlTemplate={map["macAddress.urlTemplate"] ?? ""}
          initialLocationUrlTemplate={map["location.urlTemplate"] ?? ""}
        />
      </div>

      <div>
        <BrandingSettingsClient
          initialAppTitle={map["app.title"] ?? "SAM"}
          initialHasLogo={!!map["branding.logoStorageKey"]}
          initialHasFavicon={!!map["branding.faviconStorageKey"]}
          initialBackgroundMode={map["branding.backgroundMode"] ?? ""}
          initialHasCustomBackground={!!map["branding.backgroundStorageKey"]}
        />
      </div>

      <div>
        <ComplianceSettingsClient
          initialRequireTwoFactor={map["security.requireTwoFactor"] === "true"}
          initialAuditRetentionDays={parseInt(map["audit.retentionDays"] ?? "730", 10)}
          initialDefaultOwnerId={map["assets.defaultOwnerId"] || null}
          initialReviewWorkLogItemId={map["compliance.reviewWorkLogItemId"] || null}
          initialReviewPeriodMonths={parseInt(map["compliance.reviewPeriodMonths"] ?? "12", 10)}
          users={users}
          workLogItems={workLogItems.map((i) => ({ id: i.id, name: i.name }))}
        />
      </div>

      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold">Work log items</h2>
          <p className="text-muted-foreground mt-1">
            Fixed work log items technicians can select on a location&apos;s work log (e.g. &quot;Review asset
            list&quot;). Track and report which locations have each item filled in.
          </p>
        </div>
        <WorkLogItemsManager initialItems={workLogItems} />
      </div>

      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold">Firmware baselines</h2>
          <p className="text-muted-foreground mt-1">
            The approved firmware version per asset type and model. Devices at or above their
            baseline count as up to date; those without a baseline are reported as unclassified
            rather than compliant, so the NIS2 figures never overstate coverage.
          </p>
        </div>
        <FirmwareBaselinesClient
          baselines={firmwareBaselines}
          observed={observed}
          assetTypes={assetTypes}
        />
      </div>
    </div>
  );
}

export const metadata = { title: "Settings – SAM Admin" };

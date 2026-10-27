"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { AttachmentGallery, type Attachment } from "@/components/attachments/attachment-gallery";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { RemoveAssetDialog } from "@/components/assets/remove-asset-dialog";
import { formatDate } from "@/lib/utils";
import {
  ChevronRight,
  Pencil,
  Trash2,
  Package,
  KeyRound,
  Lock,
  MapPin,
  Clock,
  Calendar,
  Wrench,
  ExternalLink,
  FolderInput,
  RotateCcw,
  TriangleAlert,
  History,
  FileText,
} from "lucide-react";
import { renderHostnameUrl, renderMacAddressUrl } from "@/lib/hostname/template";
import { getAssetTypeIcon } from "@/lib/asset-type-icon";
import { MoveAssetDialog } from "@/components/assets/move-asset-dialog";
import { AssetHistoryTimeline } from "@/components/assets/asset-history-timeline";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

type Asset = {
  id: string;
  locationId: string;
  model?: { id: string; name: string; documentationUrl: string | null } | null;
  serialNumber?: string | null;
  hostname?: string | null;
  quantity: number;
  installationDate?: Date | string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Date | string | null;
  warrantyMonths?: number | null;
  notes?: string | null;
  vaultPath?: string | null;
  ownerId?: string | null;
  criticality?: string | null;
  endOfSupportDate?: Date | string | null;
  supplierId?: string | null;
  status: string;
  decommissionedAt?: Date | string | null;
  decommissionNote?: string | null;
  disposalMethod?: string | null;
  decommissionedById?: string | null;
  repairStartedAt?: Date | string | null;
  repairNote?: string | null;
  sentForRepairById?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  type?: { id: string; name: string; defaultCriticality?: string | null } | null;
  manufacturer?: { id: string; name: string } | null;
  supplier?: { id: string; name: string; contractReference?: string | null } | null;
  macAddresses: { id: string; address: string }[];
  customFields: { id: string; key: string; value: string }[];
  location: { id: string; name: string };
  attachments: Attachment[];
};

type Breadcrumb = { id: string; name: string };

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
      <div className="flex items-center gap-2 px-[18px] py-[14px] border-b border-[#e2e8f0]">
        <span className="text-[#64748b]">{icon}</span>
        <h3 className="text-[13px] font-semibold text-[#0f172a]">{title}</h3>
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-1">
      {children}
    </dt>
  );
}

function FieldValue({ value, mono, children }: { value?: string | null; mono?: boolean; children?: React.ReactNode }) {
  return (
    <dd className={mono ? "font-mono text-[12px] text-[#0f172a]" : "text-[13px] text-[#0f172a]"}>
      {children || (value ? value : <span className="text-[#64748b]">—</span>)}
    </dd>
  );
}

export function AssetDetailClient({
  asset,
  breadcrumbs,
  userRole,
  hostnameUrlTemplate,
  macAddressUrlTemplate,
  ownerName,
  decommissionedByName,
  sentForRepairByName,
}: {
  asset: Asset;
  breadcrumbs: Breadcrumb[];
  userRole: Role;
  hostnameUrlTemplate?: string | null;
  macAddressUrlTemplate?: string | null;
  ownerName?: string | null;
  decommissionedByName?: string | null;
  sentForRepairByName?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("asset");
  const tField = useTranslations("field");
  const tCommon = useTranslations("common");
  const tDecom = useTranslations("decommissioned");
  const tRepair = useTranslations("repair");
  const tHistory = useTranslations("history");
  const canEdit = permissions.canEdit(userRole);
  const isDecommissioned = asset.status === "DECOMMISSIONED";
  const isInRepair = asset.status === "IN_REPAIR";
  const [attachments, setAttachments] = useState(asset.attachments);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reinstating, setReinstating] = useState(false);

  async function handleReinstate() {
    setReinstating(true);
    const res = await fetch(`/api/assets/${asset.id}/reinstate`, { method: "POST" });
    setReinstating(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: tDecom("reinstated") });
    router.refresh();
  }

  const displayName = asset.model?.name || asset.serialNumber || t("unnamedAsset");
  const AssetTypeIcon = getAssetTypeIcon(asset.type?.name);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-[12px] text-[#64748b] flex-wrap">
        <Link href="/locations" className="hover:text-[#0f172a] transition-colors">{tCommon("home")}</Link>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <Link href={`/locations/${crumb.id}`} className="hover:text-[#0f172a] transition-colors">
              {crumb.name}
            </Link>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <span className="text-[#0f172a] font-medium">{displayName}</span>
        </span>
      </nav>

      {/* Decommissioned banner */}
      {isDecommissioned && (
        <div className="flex items-start gap-3 bg-[#fefce8] border border-[#fde047] rounded-[10px] px-4 py-3">
          <TriangleAlert className="h-4 w-4 text-[#ca8a04] mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#713f12]">
              {tDecom("bannerLabel")}
              {asset.decommissionedAt && (
                <span className="font-normal ml-1.5 text-[#92400e]">
                  · {new Date(asset.decommissionedAt).toLocaleDateString("sv-SE")}
                </span>
              )}
            </p>
            {(asset.disposalMethod || decommissionedByName) && (
              <p className="text-[12px] text-[#92400e] mt-0.5">
                {asset.disposalMethod && tDecom(`disposalMethod.${asset.disposalMethod}`)}
                {asset.disposalMethod && decommissionedByName && " · "}
                {decommissionedByName && tDecom("decommissionedBy", { name: decommissionedByName })}
              </p>
            )}
            {asset.decommissionNote && (
              <p className="text-[12px] text-[#92400e] mt-0.5">{asset.decommissionNote}</p>
            )}
          </div>
          {permissions.isAdmin(userRole) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-[30px] text-[12px] gap-1.5 border-[#fde047] text-[#713f12] hover:bg-[#fef9c3] flex-shrink-0">
                  <RotateCcw className="h-3 w-3" />
                  {tDecom("reinstate")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tDecom("reinstateConfirmTitle", { name: displayName })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tDecom("reinstateConfirmDescription", { location: tDecom("itsLocation") })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReinstate} disabled={reinstating} className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white">
                    {reinstating ? tDecom("reinstating") : tDecom("reinstate")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* In-repair banner */}
      {isInRepair && (
        <div className="flex items-start gap-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-[10px] px-4 py-3">
          <Wrench className="h-4 w-4 text-[#1e40af] mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#1e3a8a]">
              {tRepair("bannerLabel")}
              {asset.repairStartedAt && (
                <span className="font-normal ml-1.5 text-[#1e40af]">
                  · {new Date(asset.repairStartedAt).toLocaleDateString("sv-SE")}
                </span>
              )}
            </p>
            {sentForRepairByName && (
              <p className="text-[12px] text-[#1e40af] mt-0.5">
                {tRepair("sentForRepairBy", { name: sentForRepairByName })}
              </p>
            )}
            {asset.repairNote && (
              <p className="text-[12px] text-[#1e40af] mt-0.5">{asset.repairNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
            <AssetTypeIcon className="h-4 w-4 text-[#1e64c8]" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">{displayName}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {asset.type && (
                <span className="text-[11px] font-semibold bg-[#e8f0fc] text-[#1e64c8] px-[10px] py-[3px] rounded-[5px]">
                  {asset.type.name}
                </span>
              )}
              {asset.manufacturer && (
                <span className="text-[11px] font-medium bg-[#f1f5f9] text-[#64748b] px-[10px] py-[3px] rounded-[5px]">
                  {asset.manufacturer.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {canEdit && !isDecommissioned && (
          <div className="flex gap-2 flex-wrap justify-end">
            {!isInRepair && (
              <>
                <AssetFormDialog
                  mode="edit"
                  assetId={asset.id}
                  locationId={asset.locationId}
                  onSuccess={() => router.refresh()}
                >
                  <Button variant="outline" size="sm" className="h-[34px] rounded-[7px] border-[#e2e8f0] text-[13px] gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    {tCommon("edit")}
                  </Button>
                </AssetFormDialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMoveOpen(true)}
                  className="h-[34px] rounded-[7px] border-[#e2e8f0] text-[13px] gap-1.5"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                  {t("moveAssetButton")}
                </Button>
              </>
            )}

            <RemoveAssetDialog
              assetId={asset.id}
              assetName={displayName}
              assetStatus={asset.status}
              onRemoved={(action) => {
                if (action === "stock") {
                  router.push("/stock");
                } else if (action === "delete") {
                  router.push(`/locations/${asset.locationId}`);
                } else {
                  router.refresh();
                }
              }}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-[34px] rounded-[7px] border-[#fecaca] text-[#ef4444] hover:bg-red-50 text-[13px] gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("removeAsset")}
              </Button>
            </RemoveAssetDialog>
          </div>
        )}
      </div>

      <MoveAssetDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        assetId={asset.id}
        assetName={displayName}
        currentLocationId={asset.locationId}
        currentLocationName={asset.location.name}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Col 1–2: Asset Details + Custom Fields */}
        <div className="lg:col-span-2 space-y-6">
          <InfoCard icon={<Package className="h-3.5 w-3.5" />} title={t("assetDetails")}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-[14px]">
              <div><FieldLabel>{tField("type")}</FieldLabel><FieldValue value={asset.type?.name} /></div>
              <div><FieldLabel>{tField("manufacturer")}</FieldLabel><FieldValue value={asset.manufacturer?.name} /></div>
              <div>
                <FieldLabel>{tField("model")}</FieldLabel>
                <FieldValue>
                  {asset.model ? (
                    <span className="inline-flex items-center gap-1.5">
                      {asset.model.name}
                      {!asset.model.documentationUrl && (
                        <TriangleAlert
                          className="h-3.5 w-3.5 text-[#ca8a04] flex-shrink-0"
                          aria-label={t("modelNoDocumentation")}
                        >
                          <title>{t("modelNoDocumentation")}</title>
                        </TriangleAlert>
                      )}
                    </span>
                  ) : undefined}
                </FieldValue>
              </div>
              <div><FieldLabel>{tField("serialNumber")}</FieldLabel><FieldValue value={asset.serialNumber} mono /></div>
              {asset.quantity !== 1 && (
                <div><FieldLabel>{tField("quantity")}</FieldLabel><FieldValue value={String(asset.quantity)} /></div>
              )}
              <div>
                <FieldLabel>{tField("hostname")}</FieldLabel>
                {asset.hostname && hostnameUrlTemplate ? (
                  <dd className="font-mono text-[12px]">
                    <a
                      href={renderHostnameUrl(hostnameUrlTemplate, asset)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1e64c8] hover:underline inline-flex items-center gap-1"
                    >
                      {asset.hostname}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  </dd>
                ) : (
                  <FieldValue value={asset.hostname} mono />
                )}
              </div>
              <div>
                <FieldLabel>{tField("location")}</FieldLabel>
                <FieldValue>
                  <Link href={`/locations/${asset.location.id}`} className="text-[#1e64c8] hover:underline inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {asset.location.name}
                  </Link>
                </FieldValue>
              </div>
              <div><FieldLabel>{tField("installationDate")}</FieldLabel><FieldValue value={formatDate(asset.installationDate)} /></div>
              <div><FieldLabel>{tField("invoiceNumber")}</FieldLabel><FieldValue value={asset.invoiceNumber} /></div>
              <div><FieldLabel>{tField("invoiceDate")}</FieldLabel><FieldValue value={formatDate(asset.invoiceDate)} /></div>
              <div><FieldLabel>{tField("warrantyMonths")}</FieldLabel><FieldValue value={asset.warrantyMonths != null ? String(asset.warrantyMonths) : null} /></div>
              <div>
                <FieldLabel>{tField("owner")}</FieldLabel>
                <FieldValue value={ownerName ?? (asset.ownerId ? t("deletedUser") : null)} />
              </div>
              <div>
                <FieldLabel>{tField("supplier")}</FieldLabel>
                <FieldValue>
                  {asset.supplier ? (
                    <>
                      {asset.supplier.name}
                      {asset.supplier.contractReference && (
                        <span className="text-[#64748b] text-[12px] ml-1.5">({asset.supplier.contractReference})</span>
                      )}
                    </>
                  ) : (
                    <span className="text-[#64748b]">—</span>
                  )}
                </FieldValue>
              </div>
              <div>
                <FieldLabel>{tField("criticality")}</FieldLabel>
                <FieldValue>
                  {(() => {
                    const effective = asset.criticality ?? asset.type?.defaultCriticality ?? null;
                    if (!effective) return <span className="text-[#64748b]">{t("unclassified")}</span>;
                    return (
                      <>
                        {tCommon(`criticality.${effective}`)}
                        {!asset.criticality && (
                          <span className="text-[#64748b] text-[12px] ml-1.5">({t("inheritedFromType")})</span>
                        )}
                      </>
                    );
                  })()}
                </FieldValue>
              </div>
              <div>
                <FieldLabel>{tField("endOfSupport")}</FieldLabel>
                {asset.endOfSupportDate && new Date(asset.endOfSupportDate) < new Date() ? (
                  <dd className="text-[13px] text-[#dc2626] font-medium">
                    {formatDate(asset.endOfSupportDate)} · {t("endOfSupportPassed")}
                  </dd>
                ) : (
                  <FieldValue value={formatDate(asset.endOfSupportDate)} />
                )}
              </div>
            </dl>

            {asset.macAddresses.length > 0 && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-2">
                  {tField("macAddresses")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {asset.macAddresses.map((mac) =>
                    macAddressUrlTemplate ? (
                      <a
                        key={mac.id}
                        href={renderMacAddressUrl(macAddressUrlTemplate, mac.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11.5px] bg-[#e8f0fc] text-[#1e64c8] px-[10px] py-[3px] rounded-[5px] inline-flex items-center gap-1 hover:underline"
                      >
                        {mac.address}
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    ) : (
                      <span key={mac.id} className="font-mono text-[11.5px] bg-[#f1f5f9] text-[#334155] px-[10px] py-[3px] rounded-[5px]">
                        {mac.address}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {asset.notes && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-2">{tField("notes")}</p>
                <p className="text-[13px] text-[#334155] leading-relaxed whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}

            {asset.vaultPath && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <div className="flex items-center gap-2 text-[12px] text-[#64748b]">
                  <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-medium text-[#0f172a]">{tField("vaultPath")}:</span>
                  <code className="font-mono bg-[#f1f5f9] text-[#334155] px-2 py-0.5 rounded-[4px] text-[11.5px]">
                    {asset.vaultPath}
                  </code>
                </div>
              </div>
            )}

            {asset.customFields.length > 0 && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-3">
                  {tField("customFields")}
                </p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-[14px]">
                  {asset.customFields.map((f) => (
                    <div key={f.id}>
                      <FieldLabel>{f.key}</FieldLabel>
                      <FieldValue value={f.value} />
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </InfoCard>

          <InfoCard icon={<KeyRound className="h-3.5 w-3.5" />} title={t("attachments")}>
            {asset.model && (
              <div
                className={`flex items-center gap-2 px-3 py-2 mb-3 rounded-[8px] border text-[12.5px] ${
                  asset.model.documentationUrl
                    ? "border-[#e2e8f0] bg-white"
                    : "border-[#fde047] bg-[#fefce8] text-[#713f12]"
                }`}
              >
                {asset.model.documentationUrl ? (
                  <>
                    <FileText className="h-3.5 w-3.5 text-[#64748b] flex-shrink-0" />
                    <a
                      href={asset.model.documentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1e64c8] hover:underline inline-flex items-center gap-1"
                    >
                      {t("modelDocumentation")}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                    </a>
                  </>
                ) : (
                  <>
                    <TriangleAlert className="h-3.5 w-3.5 text-[#ca8a04] flex-shrink-0" />
                    <span>{t("modelNoDocumentation")}</span>
                  </>
                )}
              </div>
            )}
            <AttachmentGallery
              attachments={attachments}
              assetId={asset.id}
              canEdit={canEdit}
              onUpdate={setAttachments}
            />
          </InfoCard>
        </div>

        {/* Col 3: Record Info */}
        <div className="space-y-6">
          <InfoCard icon={<Clock className="h-3.5 w-3.5" />} title={t("recordInfo")}>
            <div className="space-y-3">
              <div>
                <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">{tField("created")}</p>
                <p className="text-[12.5px] text-[#334155]">{formatDate(asset.createdAt)}</p>
              </div>
              <div>
                <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">{tField("lastModified")}</p>
                <p className="text-[12.5px] text-[#334155]">{formatDate(asset.updatedAt)}</p>
              </div>
              <div>
                <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">{tField("location")}</p>
                <Link href={`/locations/${asset.location.id}`} className="text-[12.5px] text-[#1e64c8] hover:underline inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 fill-[#1e64c8] stroke-[#1e64c8]" />
                  {asset.location.name}
                </Link>
              </div>
              {asset.installationDate && (
                <div>
                  <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">{tField("installed")}</p>
                  <p className="text-[12.5px] text-[#334155] inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(asset.installationDate)}
                  </p>
                </div>
              )}
            </div>
          </InfoCard>

          <InfoCard icon={<History className="h-3.5 w-3.5" />} title={tHistory("title")}>
            <AssetHistoryTimeline assetId={asset.id} />
          </InfoCard>

          {attachments.length > 0 && (
            <InfoCard icon={<Wrench className="h-3.5 w-3.5" />} title={t("attachments")}>
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.slice(0, 3).map((att) => {
                  const isImage = att.mimeType?.startsWith("image/");
                  const isPdf = att.mimeType === "application/pdf";
                  return (
                    <a
                      key={att.id}
                      href={`/api/attachments/${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-[52px] h-[52px] rounded-[7px] flex items-center justify-center text-[10px] text-center font-medium overflow-hidden ${
                        isImage ? "bg-[#dbeafe]" : isPdf ? "bg-[#fee2e2]" : "bg-[#f1f5f9]"
                      }`}
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/attachments/${att.id}`} alt={att.originalName} className="w-full h-full object-cover rounded-[7px]" />
                      ) : (
                        <span className="text-[10px] text-[#64748b] px-1 truncate">{att.originalName.split(".").pop()?.toUpperCase()}</span>
                      )}
                    </a>
                  );
                })}
              </div>
              <a
                href="#attachments"
                className="flex w-full h-[30px] items-center justify-center border border-[#e2e8f0] rounded-[6px] bg-[#f8fafc] text-[12px] text-[#64748b] hover:bg-white transition-colors"
              >
                {t("viewAllAttachments", { count: attachments.length, plural: attachments.length !== 1 ? "s" : "" })}
              </a>
            </InfoCard>
          )}
        </div>
      </div>
    </div>
  );
}

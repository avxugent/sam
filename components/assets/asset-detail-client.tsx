"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { formatDate } from "@/lib/utils";
import {
  ChevronRight,
  Pencil,
  Trash2,
  Monitor,
  Package,
  KeyRound,
  Lock,
  MapPin,
  Clock,
  Calendar,
  Wrench,
  ExternalLink,
  FolderInput,
  ArchiveX,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderHostnameUrl, renderMacAddressUrl } from "@/lib/hostname-template";
import { MoveAssetDialog } from "@/components/assets/move-asset-dialog";

type Attachment = {
  id: string;
  attachmentType?: string;
  filename?: string | null;
  originalName: string;
  mimeType?: string | null;
  size?: number | null;
  url?: string | null;
  createdAt: Date | string;
  uploadedBy: { id: string; name: string };
};

type Asset = {
  id: string;
  locationId: string;
  model?: string | null;
  serialNumber?: string | null;
  hostname?: string | null;
  installationDate?: Date | string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Date | string | null;
  notes?: string | null;
  vaultPath?: string | null;
  status: string;
  decommissionedAt?: Date | string | null;
  decommissionNote?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  type?: { id: string; name: string } | null;
  manufacturer?: { id: string; name: string } | null;
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
}: {
  asset: Asset;
  breadcrumbs: Breadcrumb[];
  userRole: string;
  hostnameUrlTemplate?: string | null;
  macAddressUrlTemplate?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";
  const isDecommissioned = asset.status === "DECOMMISSIONED";
  const [attachments, setAttachments] = useState(asset.attachments);
  const [moveOpen, setMoveOpen] = useState(false);
  const [decommissionNote, setDecommissionNote] = useState("");
  const [decommissioning, setDecommissioning] = useState(false);
  const [reinstating, setReinstating] = useState(false);

  async function handleDecommission() {
    setDecommissioning(true);
    const res = await fetch(`/api/assets/${asset.id}/decommission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: decommissionNote || null }),
    });
    setDecommissioning(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Asset decommissioned" });
    setDecommissionNote("");
    router.refresh();
  }

  async function handleReinstate() {
    setReinstating(true);
    const res = await fetch(`/api/assets/${asset.id}/reinstate`, { method: "POST" });
    setReinstating(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Asset reinstated" });
    router.refresh();
  }

  async function handleDelete() {
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Asset deleted" });
    router.push(`/locations/${asset.locationId}`);
    router.refresh();
  }

  const displayName = asset.model || asset.serialNumber || "Unnamed Asset";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-[12px] text-[#64748b] flex-wrap">
        <Link href="/" className="hover:text-[#0f172a] transition-colors">Home</Link>
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
              Decommissioned
              {asset.decommissionedAt && (
                <span className="font-normal ml-1.5 text-[#92400e]">
                  · {new Date(asset.decommissionedAt).toLocaleDateString()}
                </span>
              )}
            </p>
            {asset.decommissionNote && (
              <p className="text-[12px] text-[#92400e] mt-0.5">{asset.decommissionNote}</p>
            )}
          </div>
          {userRole === "ADMIN" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-[30px] text-[12px] gap-1.5 border-[#fde047] text-[#713f12] hover:bg-[#fef9c3] flex-shrink-0">
                  <RotateCcw className="h-3 w-3" />
                  Reinstate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reinstate &quot;{displayName}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the asset as installed again and restore it to the active asset list.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReinstate} disabled={reinstating} className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white">
                    {reinstating ? "Reinstating…" : "Reinstate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
            <Monitor className="h-4 w-4 text-[#1e64c8]" />
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
          <div className="flex gap-2 flex-shrink-0">
            <AssetFormDialog
              mode="edit"
              assetId={asset.id}
              locationId={asset.locationId}
              onSuccess={() => router.refresh()}
            >
              <Button variant="outline" size="sm" className="h-[34px] rounded-[7px] border-[#e2e8f0] text-[13px] gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </AssetFormDialog>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoveOpen(true)}
              className="h-[34px] rounded-[7px] border-[#e2e8f0] text-[13px] gap-1.5"
            >
              <FolderInput className="h-3.5 w-3.5" />
              Move
            </Button>

            {/* Decommission */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-[34px] rounded-[7px] border-[#fde047] text-[#92400e] hover:bg-[#fef9c3] text-[13px] gap-1.5">
                  <ArchiveX className="h-3.5 w-3.5" />
                  Decommission
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Decommission &quot;{displayName}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The asset will be marked as decommissioned and removed from the active asset list. It will not be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="px-6 pb-2 space-y-1">
                  <Label htmlFor="decommission-note" className="text-[13px]">Reason (optional)</Label>
                  <Input
                    id="decommission-note"
                    value={decommissionNote}
                    onChange={(e) => setDecommissionNote(e.target.value)}
                    placeholder="e.g. End of life, hardware failure…"
                    maxLength={500}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDecommissionNote("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDecommission}
                    disabled={decommissioning}
                    className="bg-[#ca8a04] hover:bg-[#a16207] text-white"
                  >
                    {decommissioning ? "Decommissioning…" : "Decommission"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-[34px] rounded-[7px] border-[#fecaca] text-[#ef4444] hover:bg-red-50 text-[13px] gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{displayName}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this asset and all its attachments.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
          <InfoCard icon={<Package className="h-3.5 w-3.5" />} title="Asset Details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-[14px]">
              <div><FieldLabel>Type</FieldLabel><FieldValue value={asset.type?.name} /></div>
              <div><FieldLabel>Manufacturer</FieldLabel><FieldValue value={asset.manufacturer?.name} /></div>
              <div><FieldLabel>Model</FieldLabel><FieldValue value={asset.model} /></div>
              <div><FieldLabel>Serial Number</FieldLabel><FieldValue value={asset.serialNumber} mono /></div>
              <div>
                <FieldLabel>Hostname</FieldLabel>
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
                <FieldLabel>Location</FieldLabel>
                <FieldValue>
                  <Link href={`/locations/${asset.location.id}`} className="text-[#1e64c8] hover:underline inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {asset.location.name}
                  </Link>
                </FieldValue>
              </div>
              <div><FieldLabel>Installation Date</FieldLabel><FieldValue value={formatDate(asset.installationDate)} /></div>
              <div><FieldLabel>Invoice Number</FieldLabel><FieldValue value={asset.invoiceNumber} /></div>
              <div><FieldLabel>Invoice Date</FieldLabel><FieldValue value={formatDate(asset.invoiceDate)} /></div>
            </dl>

            {asset.macAddresses.length > 0 && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-2">
                  MAC Addresses
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
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-2">Notes</p>
                <p className="text-[13px] text-[#334155] leading-relaxed whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}

            {asset.vaultPath && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <div className="flex items-center gap-2 text-[12px] text-[#64748b]">
                  <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-medium text-[#0f172a]">Vault path:</span>
                  <code className="font-mono bg-[#f1f5f9] text-[#334155] px-2 py-0.5 rounded-[4px] text-[11.5px]">
                    {asset.vaultPath}
                  </code>
                </div>
              </div>
            )}

            {asset.customFields.length > 0 && (
              <div className="border-t border-[#e2e8f0] mt-4 pt-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#64748b] mb-3">
                  Custom Fields
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

          <InfoCard icon={<KeyRound className="h-3.5 w-3.5" />} title="Attachments">
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
          <InfoCard icon={<Clock className="h-3.5 w-3.5" />} title="Record Info">
            <div className="space-y-3">
              <div>
                <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">Created</p>
                <p className="text-[12.5px] text-[#334155]">{formatDate(asset.createdAt)}</p>
              </div>
              <div>
                <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">Last Modified</p>
                <p className="text-[12.5px] text-[#334155]">{formatDate(asset.updatedAt)}</p>
              </div>
              <div>
                <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">Location</p>
                <Link href={`/locations/${asset.location.id}`} className="text-[12.5px] text-[#1e64c8] hover:underline inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 fill-[#1e64c8] stroke-[#1e64c8]" />
                  {asset.location.name}
                </Link>
              </div>
              {asset.installationDate && (
                <div>
                  <p className="text-[10.5px] text-[#94a3b8] uppercase tracking-[0.07em] mb-0.5">Installed</p>
                  <p className="text-[12.5px] text-[#334155] inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(asset.installationDate)}
                  </p>
                </div>
              )}
            </div>
          </InfoCard>

          {attachments.length > 0 && (
            <InfoCard icon={<Wrench className="h-3.5 w-3.5" />} title="Attachments">
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
                View all {attachments.length} attachment{attachments.length !== 1 ? "s" : ""}
              </a>
            </InfoCard>
          )}
        </div>
      </div>
    </div>
  );
}

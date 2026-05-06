"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { LocationFormDialog } from "@/components/locations/location-form-dialog";
import { AssetTable } from "@/components/assets/asset-table";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import { CoverImagePicker } from "@/components/locations/cover-image-picker";
import { LocationMap } from "@/components/locations/location-map";
import { WorkLogList, type WorkLogEntry } from "@/components/locations/work-log-list";
import type { WorkLogAssetOption, WorkLogUserOption } from "@/components/locations/work-log-form-dialog";
import {
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  MapPin,
  Package,
  FolderOpen,
  Paperclip,
  Image as ImageIcon,
  Hash,
  Wrench,
} from "lucide-react";

function parseFiSegments(fi: string): { campus: string; building: string; floor: string; room: string } | null {
  const parts = fi.split(".");
  if (parts.length !== 4) return null;
  const [campus, building, floor, room] = parts;
  return { campus, building, floor, room };
}

type Breadcrumb = { id: string; name: string };

type LocationChild = {
  id: string;
  name: string;
  description?: string | null;
  fiNumber?: string | null;
  coverImageId?: string | null;
  _count: { assets: number; children: number };
};

type Attachment = {
  id: string;
  attachmentType?: string;
  filename?: string | null;
  originalName: string;
  mimeType?: string | null;
  size?: number | null;
  url?: string | null;
  path?: string | null;
  createdAt: Date | string;
  uploadedBy: { id: string; name: string };
};

type Asset = {
  id: string;
  model?: string | null;
  serialNumber?: string | null;
  hostname?: string | null;
  installationDate?: Date | string | null;
  type?: { id: string; name: string } | null;
  manufacturer?: { id: string; name: string } | null;
  macAddresses: { id: string; address: string }[];
  location?: { id: string; name: string } | null;
  _count: { attachments: number };
};

type Location = {
  id: string;
  name: string;
  description?: string | null;
  fiNumber?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coverImageId?: string | null;
  parent?: { id: string; name: string; parentId?: string | null } | null;
  children: LocationChild[];
  attachments: Attachment[];
  _count: { assets: number; children: number; attachments: number };
};

export function LocationDetailClient({
  location,
  assets,
  breadcrumbs,
  userRole,
  currentUserId,
  showLocation = false,
  hostnameUrlTemplate,
  macAddressUrlTemplate,
  workLogs = [],
  users = [],
  jiraEnabled = false,
  jiraBaseUrl = null,
}: {
  location: Location;
  assets: Asset[];
  breadcrumbs: Breadcrumb[];
  userRole: string;
  currentUserId?: string;
  showLocation?: boolean;
  hostnameUrlTemplate?: string | null;
  macAddressUrlTemplate?: string | null;
  workLogs?: WorkLogEntry[];
  users?: WorkLogUserOption[];
  jiraEnabled?: boolean;
  jiraBaseUrl?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("location");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("nav");
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  const [attachments, setAttachments] = useState<Attachment[]>(location.attachments);
  const [coverImageId, setCoverImageId] = useState<string | null>(location.coverImageId ?? null);
  const [mapData, setMapData] = useState({
    address: location.address,
    city: location.city,
    country: location.country,
    latitude: location.latitude,
    longitude: location.longitude,
  });

  const handleAttachmentUpdate = (updated: Attachment[]) => setAttachments(updated);

  const coverImage = attachments.find((a) => a.id === coverImageId && a.mimeType?.startsWith("image/"));

  async function handleDelete() {
    const res = await fetch(`/api/locations/${location.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: t("locationDeleted") });
    if (location.parent) {
      router.push(`/locations/${location.parent.id}`);
    } else {
      router.push("/");
    }
    router.refresh();
  }

  const hasAddress = mapData.address || mapData.city || mapData.country;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-[12px] text-[#64748b] flex-wrap">
        <Link href="/locations" className="hover:text-[#0f172a] transition-colors">{tCommon("home")}</Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {i === breadcrumbs.length - 1 ? (
              <span className="text-[#0f172a] font-medium">{crumb.name}</span>
            ) : (
              <Link href={`/locations/${crumb.id}`} className="hover:text-[#0f172a] transition-colors">
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Cover banner — always shown (blue gradient, or photo if cover image set) */}
      <div className="relative w-full rounded-[12px] overflow-hidden" style={{ height: 160 }}>
        {coverImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${coverImage.id}`}
              alt={coverImage.originalName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, #1e64c8 0%, #1a4fa0 100%)" }}
            />
            {/* Decorative circles */}
            <div className="absolute -top-8 -right-8 w-[200px] h-[200px] rounded-full bg-white opacity-[0.05]" />
            <div className="absolute -bottom-6 -left-6 w-[120px] h-[120px] rounded-full bg-white opacity-[0.06]" />
          </>
        )}

        {/* Content bottom-left */}
        <div className="absolute bottom-0 left-0 p-5">
          <h1 className="text-[24px] font-extrabold text-white tracking-[-0.02em] drop-shadow">
            {location.name}
          </h1>
          {location.fiNumber && (
            <span className="inline-block font-mono text-[11px] text-white bg-white/20 border border-white/25 px-2 py-[2px] rounded-[5px] mt-1">
              {location.fiNumber}
            </span>
          )}
          {hasAddress && (
            <p className="text-[12.5px] text-white/75 flex items-center gap-1.5 mt-1">
              <MapPin className="h-3.5 w-3.5" />
              {[mapData.address, mapData.city, mapData.country].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* Buttons top-right */}
        {canEdit && (
          <div className="absolute top-4 right-4 flex gap-2">
            <LocationFormDialog
              mode="edit"
              locationId={location.id}
              initialData={{
                name: location.name,
                description: location.description,
                fiNumber: location.fiNumber,
                address: location.address,
                city: location.city,
                country: location.country,
              }}
            >
              <Button
                size="sm"
                className="h-8 rounded-[7px] border border-white/30 bg-white/15 text-white hover:bg-white/25 backdrop-blur-[4px] gap-1.5 text-[13px]"
                variant="ghost"
              >
                <Pencil className="h-3.5 w-3.5" />
                {tCommon("edit")}
              </Button>
            </LocationFormDialog>

            <AssetFormDialog
              mode="create"
              locationId={location.id}
              onSuccess={() => router.refresh()}
            >
              <Button
                size="sm"
                className="h-8 rounded-[7px] bg-[#ffd200] text-[#0f172a] font-bold hover:brightness-95 gap-1.5 text-[13px]"
              >
                <Plus className="h-3.5 w-3.5" />
                {tNav("addAsset")}
              </Button>
            </AssetFormDialog>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-1.5 text-[13px] text-[#64748b]">
          <Package className="h-4 w-4" />
          <span>{t("directAssets", { count: location._count.assets })}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-[#64748b]">
          <FolderOpen className="h-4 w-4" />
          <span>{t("subLocations", { count: location._count.children })}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-[#64748b]">
          <Paperclip className="h-4 w-4" />
          <span>{t("attachmentsCount", { count: attachments.length })}</span>
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[#ef4444] border-[#fecaca] hover:bg-red-50 text-[13px] rounded-[7px]">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {tCommon("delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteConfirmTitle", { name: location.name })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteConfirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {tCommon("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {location.description && (
        <p className="text-[13px] text-[#64748b]">{location.description}</p>
      )}

      {/* Tabs */}
      <Tabs defaultValue="assets">
        <TabsList className="flex-wrap h-auto gap-0 border-b border-[#e2e8f0] bg-transparent rounded-none p-0">
          <TabsTrigger
            value="assets"
            className="text-[13px] text-[#64748b] px-[18px] py-[9px] rounded-none border-b-2 border-transparent data-[state=active]:border-[#1e64c8] data-[state=active]:text-[#1e64c8] data-[state=active]:font-semibold bg-transparent shadow-none"
          >
            {t("tabAssets")}
            {assets.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{assets.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="sublocations"
            className="text-[13px] text-[#64748b] px-[18px] py-[9px] rounded-none border-b-2 border-transparent data-[state=active]:border-[#1e64c8] data-[state=active]:text-[#1e64c8] data-[state=active]:font-semibold bg-transparent shadow-none"
          >
            {t("tabSubLocations")}
            {location.children.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{location.children.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="map"
            className="text-[13px] text-[#64748b] px-[18px] py-[9px] rounded-none border-b-2 border-transparent data-[state=active]:border-[#1e64c8] data-[state=active]:text-[#1e64c8] data-[state=active]:font-semibold bg-transparent shadow-none"
          >
            <MapPin className="h-3.5 w-3.5 mr-1" />
            {t("tabMap")}
          </TabsTrigger>
          <TabsTrigger
            value="attachments"
            className="text-[13px] text-[#64748b] px-[18px] py-[9px] rounded-none border-b-2 border-transparent data-[state=active]:border-[#1e64c8] data-[state=active]:text-[#1e64c8] data-[state=active]:font-semibold bg-transparent shadow-none"
          >
            {t("tabAttachments")}
            {attachments.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{attachments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="worklog"
            className="text-[13px] text-[#64748b] px-[18px] py-[9px] rounded-none border-b-2 border-transparent data-[state=active]:border-[#1e64c8] data-[state=active]:text-[#1e64c8] data-[state=active]:font-semibold bg-transparent shadow-none"
          >
            <Wrench className="h-3.5 w-3.5 mr-1" />
            {t("tabWorkLog")}
            {workLogs.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{workLogs.length}</Badge>
            )}
          </TabsTrigger>
          {canEdit && (
            <TabsTrigger
              value="cover"
              className="text-[13px] text-[#64748b] px-[18px] py-[9px] rounded-none border-b-2 border-transparent data-[state=active]:border-[#1e64c8] data-[state=active]:text-[#1e64c8] data-[state=active]:font-semibold bg-transparent shadow-none"
            >
              <ImageIcon className="h-3.5 w-3.5 mr-1" />
              {t("tabCoverImage")}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Assets tab */}
        <TabsContent value="assets" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[18px] font-semibold text-[#0f172a]">
              {showLocation ? t("allAssetsIn", { name: location.name }) : t("assetsIn", { name: location.name })}
            </h2>
          </div>
          <AssetTable assets={assets} locationId={location.id} userRole={userRole} showLocation={showLocation} hostnameUrlTemplate={hostnameUrlTemplate} macAddressUrlTemplate={macAddressUrlTemplate} />
        </TabsContent>

        {/* Sub-locations tab */}
        <TabsContent value="sublocations" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[18px] font-semibold text-[#0f172a]">{t("subLocationsHeading")}</h2>
            {canEdit && (
              <LocationFormDialog mode="create" parentId={location.id}>
                <Button size="sm" className="h-[34px] rounded-[7px] bg-[#ffd200] text-[#0f172a] font-bold hover:brightness-95 text-[13px]">
                  <Plus className="h-4 w-4 mr-1" />
                  {tNav("addSubLocation")}
                </Button>
              </LocationFormDialog>
            )}
          </div>
          {location.children.length === 0 ? (
            <div className="text-center py-12 text-[#64748b] border border-[#e2e8f0] rounded-[10px] bg-white">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{t("noSubLocations")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">
              {location.children.map((child) => (
                <Link key={child.id} href={`/locations/${child.id}`}>
                  <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-[18px_20px] hover:border-[rgba(30,100,200,0.5)] transition-colors cursor-pointer">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="h-3.5 w-3.5 fill-[#1e64c8] stroke-[#1e64c8] flex-shrink-0" />
                      <span className="text-[13.5px] font-semibold text-[#0f172a]">{child.name}</span>
                    </div>
                    {child.fiNumber && (
                      <p className="font-mono text-[11px] text-[#64748b] mb-2">{child.fiNumber}</p>
                    )}
                    <div className="flex gap-3 text-[12px] text-[#64748b]">
                      <span>{t("directAssets", { count: child._count.assets })}</span>
                      <span>{t("subLocations", { count: child._count.children })}</span>
                    </div>
                  </div>
                </Link>
              ))}
              {/* Add sub-location card */}
              {canEdit && (
                <LocationFormDialog mode="create" parentId={location.id}>
                  <div className="border-2 border-dashed border-[#e2e8f0] rounded-[10px] flex items-center justify-center gap-2 p-[18px_20px] cursor-pointer hover:border-[#94a3b8] transition-colors min-h-[80px]">
                    <Plus className="h-4 w-4 text-[#94a3b8]" />
                    <span className="text-[13px] text-[#94a3b8]">{t("addSubLocationCard")}</span>
                  </div>
                </LocationFormDialog>
              )}
            </div>
          )}
        </TabsContent>

        {/* Map & Address tab */}
        <TabsContent value="map" className="mt-4">
          <LocationMap
            locationId={location.id}
            address={mapData.address}
            city={mapData.city}
            country={mapData.country}
            latitude={mapData.latitude}
            longitude={mapData.longitude}
            canEdit={canEdit}
            onUpdate={(data) => setMapData({ ...mapData, ...data })}
          />
        </TabsContent>

        {/* Attachments tab */}
        <TabsContent value="attachments" className="mt-4">
          <AttachmentGallery
            attachments={attachments}
            locationId={location.id}
            canEdit={canEdit}
            onUpdate={handleAttachmentUpdate}
          />
        </TabsContent>

        {/* Work Log tab */}
        <TabsContent value="worklog" className="mt-4">
          <div className="mb-4">
            <h2 className="text-[18px] font-semibold text-[#0f172a]">{t("workLogHeading")}</h2>
            <p className="text-[13px] text-[#64748b] mt-1">
              {t("workLogSubtitle")}
            </p>
          </div>
          <WorkLogList
            locationId={location.id}
            entries={workLogs}
            assets={assets.map<WorkLogAssetOption>((a) => ({
              id: a.id,
              label: [a.type?.name, a.model || a.hostname || a.serialNumber, a.location?.name]
                .filter(Boolean)
                .join(" · "),
              typeId: a.type?.id ?? null,
            }))}
            users={users}
            currentUserId={currentUserId ?? ""}
            userRole={userRole}
            jiraBaseUrl={jiraEnabled ? jiraBaseUrl : null}
          />
        </TabsContent>

        {/* Cover Image tab */}
        {canEdit && (
          <TabsContent value="cover" className="mt-4">
            <div className="mb-4">
              <h2 className="text-[18px] font-semibold text-[#0f172a]">{t("coverImageHeading")}</h2>
              <p className="text-[13px] text-[#64748b] mt-1">
                {t("coverImageHelp")}
              </p>
            </div>
            <CoverImagePicker
              locationId={location.id}
              attachments={attachments}
              currentCoverImageId={coverImageId}
              onUpdate={setCoverImageId}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

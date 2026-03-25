"use client";

import { useState } from "react";
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
import {
  ChevronRight,
  Edit,
  Trash2,
  Plus,
  MapPin,
  Package,
  FolderOpen,
  Paperclip,
} from "lucide-react";

type Breadcrumb = { id: string; name: string };

type LocationChild = {
  id: string;
  name: string;
  description?: string | null;
  _count: { assets: number; children: number };
};

type Attachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path?: string;
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
  _count: { attachments: number };
};

type Location = {
  id: string;
  name: string;
  description?: string | null;
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
}: {
  location: Location;
  assets: Asset[];
  breadcrumbs: Breadcrumb[];
  userRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";
  const [attachments, setAttachments] = useState<Attachment[]>(location.attachments);
  const handleAttachmentUpdate = (updated: Attachment[]) => setAttachments(updated);

  async function handleDelete() {
    const res = await fetch(`/api/locations/${location.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Location deleted" });
    if (location.parent) {
      router.push(`/locations/${location.parent.id}`);
    } else {
      router.push("/");
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {i === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{crumb.name}</span>
            ) : (
              <Link
                href={`/locations/${crumb.id}`}
                className="hover:text-foreground transition-colors"
              >
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">{location.name}</h1>
          </div>
          {location.description && (
            <p className="text-muted-foreground mt-1">{location.description}</p>
          )}
          <div className="flex gap-3 mt-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              <span>{location._count.assets} direct assets</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FolderOpen className="h-4 w-4" />
              <span>{location._count.children} sub-locations</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Paperclip className="h-4 w-4" />
              <span>{location._count.attachments} attachments</span>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2 flex-shrink-0">
            <LocationFormDialog
              mode="edit"
              locationId={location.id}
              initialData={{ name: location.name, description: location.description }}
            >
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </LocationFormDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{location.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this location and all its assets and
                    attachments. Sub-locations must be removed first. This action cannot be
                    undone.
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

      {/* Tabs */}
      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">
            Assets
            {assets.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {assets.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sublocations">
            Sub-locations
            {location.children.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {location.children.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="attachments">
            Attachments
            {attachments.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {attachments.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Assets tab */}
        <TabsContent value="assets" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Assets in {location.name}</h2>
            {canEdit && (
              <AssetFormDialog
                mode="create"
                locationId={location.id}
                onSuccess={() => router.refresh()}
              >
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Asset
                </Button>
              </AssetFormDialog>
            )}
          </div>
          <AssetTable assets={assets} locationId={location.id} userRole={userRole} />
        </TabsContent>

        {/* Sub-locations tab */}
        <TabsContent value="sublocations" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Sub-locations</h2>
            {canEdit && (
              <LocationFormDialog mode="create" parentId={location.id}>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Sub-location
                </Button>
              </LocationFormDialog>
            )}
          </div>
          {location.children.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No sub-locations yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {location.children.map((child) => (
                <Link key={child.id} href={`/locations/${child.id}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {child.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {child.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {child.description}
                        </p>
                      )}
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{child._count.assets} assets</span>
                        <span>{child._count.children} sub-locations</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
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
      </Tabs>
    </div>
  );
}

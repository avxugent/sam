"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  Edit,
  Trash2,
  Monitor,
  Package,
} from "lucide-react";

type Attachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
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

export function AssetDetailClient({
  asset,
  breadcrumbs,
  userRole,
}: {
  asset: Asset;
  breadcrumbs: Breadcrumb[];
  userRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";
  const [attachments, setAttachments] = useState(asset.attachments);

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
      <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <Link href={`/locations/${crumb.id}`} className="hover:text-foreground transition-colors">
              {crumb.name}
            </Link>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{displayName}</span>
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">{displayName}</h1>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {asset.type && <Badge variant="outline">{asset.type.name}</Badge>}
            {asset.manufacturer && (
              <Badge variant="secondary">{asset.manufacturer.name}</Badge>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <AssetFormDialog
              mode="edit"
              assetId={asset.id}
              locationId={asset.locationId}
              onSuccess={() => router.refresh()}
            >
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </AssetFormDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Asset Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <Field label="Type" value={asset.type?.name} />
                <Field label="Manufacturer" value={asset.manufacturer?.name} />
                <Field label="Model" value={asset.model} />
                <Field label="Serial Number" value={asset.serialNumber} mono />
                <Field label="Hostname" value={asset.hostname} />
                <Field label="Location">
                  <Link href={`/locations/${asset.location.id}`} className="text-primary hover:underline">
                    {asset.location.name}
                  </Link>
                </Field>
                <Field label="Installation Date" value={formatDate(asset.installationDate)} />
                <Field label="Invoice Number" value={asset.invoiceNumber} />
                <Field label="Invoice Date" value={formatDate(asset.invoiceDate)} />
              </dl>

              {asset.macAddresses.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      MAC Addresses
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {asset.macAddresses.map((mac) => (
                        <code key={mac.id} className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {mac.address}
                        </code>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {asset.notes && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Notes
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{asset.notes}</p>
                  </div>
                </>
              )}

              {asset.customFields.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Custom Fields
                  </p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    {asset.customFields.map((f) => (
                      <Field key={f.id} label={f.key} value={f.value} />
                    ))}
                  </dl>
                </>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentGallery
                attachments={attachments}
                assetId={asset.id}
                canEdit={canEdit}
                onUpdate={setAttachments}
              />
            </CardContent>
          </Card>
        </div>

        {/* Metadata sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Record Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p>{formatDate(asset.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Modified</p>
                <p>{formatDate(asset.updatedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <Link href={`/locations/${asset.location.id}`} className="text-primary hover:underline">
                  {asset.location.name}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  children,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-xs" : ""}>
        {children || (value ? value : <span className="text-muted-foreground">—</span>)}
      </dd>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Search, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type DecommissionedAsset = {
  id: string;
  locationId: string;
  model: string | null;
  serialNumber: string | null;
  decommissionedAt: Date | string | null;
  decommissionNote: string | null;
  lastLocationName: string | null;
  lastLocationFiNumber: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
};

export function DecommissionedTable({
  assets: initialAssets,
  userRole,
}: {
  assets: DecommissionedAsset[];
  userRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [assets, setAssets] = useState(initialAssets);
  const [query, setQuery] = useState("");
  const isAdmin = userRole === "ADMIN";

  const filtered = assets.filter((a) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      a.model?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.type?.name.toLowerCase().includes(q) ||
      a.manufacturer?.name.toLowerCase().includes(q) ||
      a.lastLocationName?.toLowerCase().includes(q) ||
      a.decommissionNote?.toLowerCase().includes(q)
    );
  });

  async function handleReinstate(id: string) {
    const res = await fetch(`/api/assets/${id}/reinstate`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Asset reinstated" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
        <Input
          placeholder="Search decommissioned…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 text-[13px]"
        />
      </div>

      <div className="border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <tr>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">Type</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">Model</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">Serial</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">Last Location</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">Decommissioned</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">Note</th>
              {isAdmin && <th className="px-3 py-2.5 w-[60px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-3 py-8 text-center text-[13px] text-[#94a3b8]">
                  No decommissioned assets
                </td>
              </tr>
            ) : (
              filtered.map((asset) => (
                <tr key={asset.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-3 py-2.5">
                    {asset.type ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b] text-[11px] font-medium">
                        {asset.type.name}
                      </span>
                    ) : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/locations/${asset.locationId}/assets/${asset.id}`}
                      className="font-medium text-[#0f172a] hover:text-[#1e64c8] hover:underline"
                    >
                      {asset.model || asset.serialNumber || "Unnamed"}
                    </Link>
                    {asset.manufacturer && (
                      <span className="text-[11.5px] text-[#94a3b8] ml-1.5">{asset.manufacturer.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {asset.serialNumber
                      ? <span className="font-mono text-[11.5px] text-[#64748b]">{asset.serialNumber}</span>
                      : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">
                    <span className="text-[#334155]">{asset.lastLocationName ?? "—"}</span>
                    {asset.lastLocationFiNumber && (
                      <span className="ml-1.5 font-mono text-[11px] text-[#94a3b8]">{asset.lastLocationFiNumber}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#64748b]">
                    {asset.decommissionedAt ? formatDate(asset.decommissionedAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#64748b] max-w-[200px] truncate">
                    {asset.decommissionNote || <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-[#e8f0fc]" title="Reinstate asset">
                            <RotateCcw className="h-3.5 w-3.5 text-[#1e64c8]" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reinstate &quot;{asset.model || asset.serialNumber || "asset"}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The asset will be marked as installed again and reappear in {asset.lastLocationName ?? "its location"}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleReinstate(asset.id)}
                              className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
                            >
                              Reinstate
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

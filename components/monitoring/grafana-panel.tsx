"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

/**
 * Wrapper for a page's monitoring summary.
 *
 * There is deliberately no embedded chart here. Rendering Grafana panels — as
 * iframes, then as server-rendered PNGs — was tried and removed: the frame was
 * blocked by SAM's own CSP and could never have worked anyway (Grafana's
 * /d-solo/ is a full SPA whose absolute asset paths resolve against SAM), and
 * the image version was slow enough to question the point and looked foreign
 * inside SAM's UI. The numbers come from Prometheus directly; anything richer
 * is one click away in Grafana.
 */
export function MonitoringSection({
  title,
  openUrl,
  openLabel = "Open in Grafana",
  defaultOpen = true,
  collapsible = true,
  children,
}: {
  title: string;
  openUrl?: string | null;
  openLabel?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = collapsible ? open : true;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-[15px] font-semibold text-[#0f172a] hover:text-[#1e64c8]"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {title}
          </button>
        ) : (
          <h2 className="text-[15px] font-semibold text-[#0f172a]">{title}</h2>
        )}
        {openUrl && showBody && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#1e64c8] hover:underline inline-flex items-center gap-1"
          >
            {openLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {showBody && children}
    </section>
  );
}

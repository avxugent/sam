"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

/**
 * One embedded Grafana panel, fetched through SAM's proxy.
 *
 * The iframe points at SAM, not Grafana, so the browser never needs to reach
 * Grafana and no token is exposed. If the proxy returns an error the frame
 * would show SAM's JSON, which looks like a broken page — so failures render a
 * short message with a link out instead.
 */
export function GrafanaPanel({
  src,
  title,
  height = 160,
  openUrl,
}: {
  src: string;
  title: string;
  height?: number;
  openUrl?: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="rounded-[8px] border border-dashed border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-center text-[12px] text-[#64748b] px-3 text-center"
        style={{ height }}
      >
        <span>
          {title} unavailable
          {openUrl && (
            <>
              {" · "}
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1e64c8] hover:underline"
              >
                open in Grafana
              </a>
            </>
          )}
        </span>
      </div>
    );
  }

  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full rounded-[8px] border border-[#e2e8f0] bg-white"
      style={{ height }}
    />
  );
}

/** Section wrapper with a heading and a link to the full dashboard. */
export function MonitoringSection({
  title,
  openUrl,
  openLabel = "Open in Grafana",
  children,
}: {
  title: string;
  openUrl?: string | null;
  openLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#0f172a]">{title}</h2>
        {openUrl && (
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
      {children}
    </section>
  );
}

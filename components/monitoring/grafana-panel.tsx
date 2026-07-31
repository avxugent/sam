"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

/**
 * One embedded Grafana panel, fetched through SAM's proxy as a rendered image.
 *
 * An <img> rather than an <iframe>: Grafana's /d-solo/ is the full Grafana SPA
 * and its absolute asset paths would resolve against SAM inside a frame. A
 * server-rendered PNG needs no assets and no CSP exemption.
 *
 * The tradeoff is that panels are static — no tooltips, no zoom — so every one
 * links through to the real dashboard.
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

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- proxied binary from
    // Grafana, not a static asset next/image can optimise.
    <img
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full rounded-[8px] border border-[#e2e8f0] bg-white object-contain"
      style={{ height }}
    />
  );

  // Static image, so clicking through to the live dashboard is the only way to
  // hover, zoom or change the time range.
  return openUrl ? (
    <a href={openUrl} target="_blank" rel="noopener noreferrer" title={`${title} — open in Grafana`}>
      {img}
    </a>
  ) : (
    img
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

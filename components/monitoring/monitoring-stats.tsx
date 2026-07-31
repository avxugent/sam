import { cn } from "@/lib/utils";
import type { MonitoringResult, RoomMonitoring } from "@/lib/prometheus-query";

/**
 * Room monitoring numbers, rendered by SAM rather than by Grafana.
 *
 * These used to be five rendered PNGs — five headless-browser page loads for
 * what are four integers. Read straight from the recording rules they arrive in
 * milliseconds and match the rest of SAM's styling. Grafana keeps the charts,
 * where a picture actually earns its cost.
 */

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad" | "warn";
  hint?: string;
}) {
  return (
    <div className="rounded-[8px] border border-[#e2e8f0] bg-white px-3 py-2.5" title={hint}>
      <p className="text-[11px] font-medium text-[#64748b]">{label}</p>
      <p
        className={cn(
          "text-[20px] font-bold tracking-[-0.01em] tabular-nums",
          tone === "good" && "text-[#16a34a]",
          tone === "bad" && "text-[#dc2626]",
          tone === "warn" && "text-[#b45309]",
          tone === "neutral" && "text-[#0f172a]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Each failure needs a different action, so each says so. One combined
 * "unavailable" message made a misconfigured URL indistinguishable from a room
 * Prometheus has never heard of.
 */
function Unavailable({ status }: { status: "not-configured" | "unreachable" | "no-data" }) {
  const message =
    status === "not-configured"
      ? "Monitoring is not configured — PROMETHEUS_URL is not set on the server."
      : status === "unreachable"
        ? "Prometheus did not answer. Check that it is reachable from SAM and that PROMETHEUS_URL is correct."
        : "No monitoring data for this room. Check that the SAM recording rules are loaded in Prometheus and that this room has assets with a hostname.";

  return (
    <div className="rounded-[8px] border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-3 py-4 text-[12px] text-[#64748b]">
      {message}
    </div>
  );
}

export function RoomMonitoringStats({ result }: { result: MonitoringResult<RoomMonitoring> }) {
  if (result.status !== "ok") return <Unavailable status={result.status} />;
  const data = result.data;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat label="Devices" value={String(data.expected)} />
      <Stat
        label="Reporting"
        value={String(data.reporting)}
        tone={data.expected > 0 && data.reporting === data.expected ? "good" : "neutral"}
      />
      <Stat
        label="Not reporting"
        value={String(data.down)}
        tone={data.down > 0 ? "bad" : "neutral"}
        hint="Expected but not answering any probe. Excludes rooms in maintenance."
      />
      <Stat
        label="Never scraped"
        value={String(data.neverScraped)}
        tone={data.neverScraped > 0 ? "bad" : "neutral"}
        hint="No probe series exists at all — usually a service-discovery or scrape-template problem rather than a broken device."
      />
      <Stat
        label="Availability"
        value={data.availability === null ? "—" : `${Math.round(data.availability * 100)}%`}
        tone={
          data.availability === null
            ? "neutral"
            : data.availability >= 0.99
              ? "good"
              : data.availability >= 0.9
                ? "warn"
                : "bad"
        }
      />
    </div>
  );
}

const DEVICE_STATE: Record<number, { label: string; tone: "good" | "bad" | "warn" }> = {
  1: { label: "Reporting", tone: "good" },
  0: { label: "Not reporting", tone: "bad" },
  2: { label: "Maintenance", tone: "warn" },
};

export function DeviceMonitoringStats({
  result,
}: {
  result: MonitoringResult<{ state: number | null; probeDurationSeconds: number | null }>;
}) {
  if (result.status !== "ok") return <Unavailable status={result.status} />;
  const { state, probeDurationSeconds } = result.data;

  // null state means no probe series at all, which is distinct from a failed
  // probe — it points at service discovery rather than the device.
  const s = state === null ? null : DEVICE_STATE[state];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat
        label="State"
        value={s?.label ?? "Never scraped"}
        tone={s?.tone ?? "warn"}
        hint={
          s
            ? undefined
            : "No probe series exists for this device — check the asset type's scrape template."
        }
      />
      <Stat
        label="Probe duration"
        value={
          probeDurationSeconds === null ? "—" : `${Math.round(probeDurationSeconds * 1000)} ms`
        }
      />
    </div>
  );
}

/**
 * Mock device exporter for the SAM development stack.
 *
 * Real AV devices are not reachable from a laptop, so dev has inventory in SAM
 * but no device metrics — every asset reads as "never scraped". This stands in
 * for the real exporters (Pearl, blackbox, …) so the room rollups, the health
 * ratio and the device dashboards have something to show.
 *
 * It follows the multi-target exporter pattern, exactly like the production
 * exporters: Prometheus asks it about one device per scrape via ?target=, and
 * the sam_* labels come from SAM's service discovery rather than from here.
 * That means this exercises the real path — scrape template → SD → labels →
 * recording rules — instead of faking the output.
 *
 * Configure an asset type's scrape template in SAM to point at it:
 *
 *   __address__=mock-exporter:9101
 *   __metrics_path__=/probe
 *   __param_target={hostname_fqdn}
 *   __param_module=recorder
 *
 * Leave one asset type *without* a template to keep exercising the
 * never-scraped case: those assets target their hostname directly, which does
 * not resolve, so no probe_success series is ever created.
 *
 * NOT for production. No dependencies — runs on the stock node image.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 9101);
// Devices flip state on this cadence so availability graphs actually move.
const FLAP_PERIOD_MS = Number(process.env.FLAP_PERIOD_MS ?? 120_000);

/** FNV-1a. Any stable hash works; this one is short and dependency-free. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Reachability, derived from the hostname so a given device behaves the same
 * across restarts — a dashboard that changes shape on every `docker compose up`
 * is useless for checking whether a panel is right.
 *
 *   75%  always up
 *   15%  always down
 *   10%  flapping, to give the timeseries panels something to draw
 */
function isUp(target) {
  const h = hash(target);
  const bucket = h % 100;
  if (bucket < 75) return true;
  if (bucket < 90) return false;
  return (h + Math.floor(Date.now() / FLAP_PERIOD_MS)) % 3 !== 0;
}

// Deliberately includes versions that look stale, so phase 4's firmware
// baseline comparison has something to flag as outdated.
const FIRMWARE = {
  recorder: ["4.18.1", "4.17.0", "4.12.3"],
  projector: ["1.08", "1.06"],
  default: ["2.3.1", "2.2.0"],
};

/** Extra per-type metrics, to drive the device dashboard's conditional rows. */
function moduleMetrics(module, target, h) {
  if (module === "recorder") {
    return [
      metric("pearl_recording_active", "gauge", "1 while the recorder is capturing", [
        { value: h % 3 === 0 ? 1 : 0 },
      ]),
      metric("pearl_disk_free_bytes", "gauge", "Free space on the recording volume", [
        { value: 20_000_000_000 + (h % 400) * 100_000_000 },
      ]),
      metric("pearl_channel_count", "gauge", "Configured capture channels", [
        { value: 1 + (h % 4) },
      ]),
    ];
  }
  if (module === "projector") {
    return [
      metric("projector_lamp_hours", "gauge", "Lamp hours used", [{ value: h % 4000 }]),
      metric("projector_input_active", "gauge", "1 when an input signal is present", [
        { value: h % 5 === 0 ? 0 : 1 },
      ]),
    ];
  }
  return [];
}

function metric(name, type, help, samples) {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
  for (const s of samples) {
    const labels = s.labels
      ? "{" +
        Object.entries(s.labels)
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
          .join(",") +
        "}"
      : "";
    lines.push(`${name}${labels} ${s.value}`);
  }
  return lines.join("\n");
}

function probe(target, module) {
  const h = hash(target);
  const up = isUp(target);
  const versions = FIRMWARE[module] ?? FIRMWARE.default;

  const sections = [
    metric("probe_success", "gauge", "1 if the device answered, 0 otherwise", [
      { value: up ? 1 : 0 },
    ]),
    metric("probe_duration_seconds", "gauge", "Probe round-trip time", [
      { value: up ? (0.02 + (h % 300) / 1000).toFixed(3) : 0 },
    ]),
  ];

  // A device that is down reports nothing about itself — matching real
  // exporters, and making sure panels handle the absence rather than showing a
  // stale firmware version for an unreachable device.
  if (up) {
    // Real devices report through exactly one vendor exporter — Pearl for the
    // recorder module, Extron for everything else — matching the dashboards'
    // `extron_firmware_info or pearl_system_info` union.
    const firmwareMetric = module === "recorder" ? "pearl_system_info" : "extron_firmware_info";
    sections.push(
      metric(firmwareMetric, "gauge", "Installed firmware; version is in the label", [
        { labels: { version: versions[h % versions.length] }, value: 1 },
      ]),
      ...moduleMetrics(module, target, h)
    );
  }

  return sections.join("\n\n") + "\n";
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }

  if (url.pathname !== "/probe") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found — use /probe?target=<hostname>&module=<recorder|projector>\n");
    return;
  }

  const target = url.searchParams.get("target");
  if (!target) {
    // 400 makes the scrape fail loudly rather than silently reporting nothing,
    // which is what a malformed scrape template should look like.
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("missing target parameter\n");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
  res.end(probe(target, url.searchParams.get("module") ?? "default"));
}).listen(PORT, () => {
  console.log(`mock exporter listening on :${PORT} — /probe?target=<hostname>`);
});

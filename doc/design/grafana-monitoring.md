# Design — Grafana monitoring & NIS2 firmware compliance

Status: **proposal**, not implemented. Not synced to Confluence (no frontmatter).

Goal: visualise the assets SAM exposes to Prometheus — fleet overview, per-room
drill-down, per-device detail — and track firmware currency for NIS2. All
Grafana and Prometheus configuration lives in git and is applied by Ansible.

---

## Decisions taken

| Question | Decision |
|---|---|
| Where is "up to date" computed? | **In SAM.** Baseline stored in the DB, installed version synced from Prometheus, comparison in TypeScript. |
| How does Grafana reach the user? | **Embedded.** SAM's location tree and asset pages embed Grafana `d-solo` panels. SAM owns navigation. |
| How is dashboard config authored? | **Jsonnet + Ansible.** Jsonnet builds the JSON; Ansible provisions it via Grafana's file provisioning. Grafonnet was the original choice — see the note below for why it was dropped. |

**Deviation from the approved plan: no Grafonnet.** `ops/jsonnet/lib/sam.libsonnet`
is a ~250-line hand-rolled library instead. Three dashboards do not justify
vendoring a large generated library plus a `jsonnet-bundler` step, and the
dependency-free version pins nothing to a Grafana release. The tradeoff is that
we own the dashboard schema knowledge rather than borrowing it, and the library
covers only the five panel types currently in use. Revisit if the dashboard count
grows past a handful.

---

## The two gaps this design closes

**1. No per-asset series exists in Prometheus.** `/api/prometheus/metrics` today
emits only aggregates. Without one series per asset there is no way to ask
"which devices are offline" — `up == 0` only covers targets Prometheus already
has, and assets in `inMaintenance` rooms are dropped from SD entirely, so they
disappear rather than showing as down. Every "expected but not reporting" panel
depends on the join `sam_asset_info unless on(sam_hostname) probe_success`.

**2. Nothing knows the approved firmware version.** Exporters report what is
installed. Compliance needs a baseline, and a baseline is inventory data.

---

## Architecture

```
  ┌────────── SAM (Next.js + Postgres) ──────────┐
  │  inventory + firmware baseline (source of    │
  │  truth for what *should* exist and run)      │
  │                                              │
  │  /api/prometheus/sd       → targets          │
  │  /api/prometheus/metrics  → sam_asset_info,  │
  │                             sam_asset_*      │
  │  location tree UI  ──embeds──┐               │
  └───────┬──────────────────────┼───────────────┘
          │ scrape               │ d-solo iframe
          ▼                      ▼
  ┌── Prometheus ──┐      ┌──── Grafana ────┐
  │ device metrics │─────▶│ 3 dashboards    │
  │ recording rules│      │ fleet/room/dev  │
  │ alert rules    │      │ provisioned RO  │
  └───────▲────────┘      └─────────────────┘
          │ /api/v1/query (firmware sync job)
          └──────────────── SAM
```

The only new dependency edge is SAM → Prometheus for the firmware sync. It is a
periodic job; if Prometheus is unreachable the last known versions simply go
stale (surfaced via `firmwareCheckedAt`).

---

## 1. Label contract

This has to be fixed before anything else, because every recording rule joins on
it.

http_sd already attaches every non-`__` group label to the scraped series, so the
`labelmap` example in `README.md` and `doc/sam/technical/integrations.md` adds
nothing. Worse, `labelmap` *copies* rather than renames: production series today
carry both `sam_hostname` and `hostname`, `sam_model` and `model`, and so on —
doubled cardinality across every device metric, and the unprefixed copies risk
colliding with labels an exporter sets natively. Remove it from the documented
`scrape_configs`; joins use the `sam_*` names.

Contract:

- SD group labels keep their `sam_` prefix and land on device metrics unchanged.
- New per-asset series from `/api/prometheus/metrics` use the **same** `sam_*`
  label names, so `on(sam_hostname)` and `by (sam_fi_number)` work across both.
- Existing aggregate gauges (`sam_assets_by_type{type=…}` etc.) keep their
  current unprefixed labels — changing them buys nothing and breaks whatever
  already consumes them.

### Exporter contract

With the exporter/probe pattern, `up` reflects the *exporter's* health, not the
device's — and each asset type has its own exporter instance, so `instance` and
`job` identify the exporter, never the device. **All joins are on
`sam_hostname`.**

The fleet is mixed. Devices with a usable API get a custom exporter; the many
devices without one are probed by blackbox_exporter. blackbox is upstream and
emits bare `probe_success`, so that is the name to standardise on:

| Metric | Emitted by | Meaning |
|---|---|---|
| `probe_success` | blackbox + every custom exporter | `1` if the device answered, `0` otherwise |
| `device_firmware_info{version="…"}` | custom exporters only | Always `1`; the version is in the label |

Custom exporters should therefore emit `probe_success`, **not**
`pearl_probe_success`. Vendor prefixes stay on metrics that are genuinely vendor
concepts (`pearl_recording_state`, `pearl_disk_free_bytes`) — the same split
blackbox itself uses. Those per-type metrics are free-form and drive the
conditional rows on the device dashboard.

Unrelated blackbox jobs (website checks and so on) also emit `probe_success`,
but they carry no `sam_*` labels and every rule below joins against
`sam_asset_info` on `sam_hostname` — so they are structurally excluded. The join
does the scoping, not the metric name.

Blackbox-probed assets need no new mechanism: point their asset type's
`scrapeTargetTemplate` at the blackbox instance
(`__address__=blackbox:9115`, `__metrics_path__=/probe`,
`__param_target={hostname_fqdn}`) and SD attaches the `sam_*` labels as usual.

---

## 2. SAM changes

### 2.1 Per-asset info series

Add to `/api/prometheus/metrics`, one series per `INSTALLED` asset that has a
hostname:

```
sam_asset_info{sam_hostname, sam_fi_number, sam_campus, sam_building,
               sam_floor, sam_room, sam_location_name, sam_asset_type,
               sam_manufacturer, sam_model, sam_criticality} 1
sam_asset_maintenance{sam_hostname} 1        # room is inMaintenance
sam_asset_end_of_support_timestamp{sam_hostname} <unix seconds>
```

Cardinality: one series per monitored asset with ~11 labels. Fine at the low
thousands. Keep the label set stable — churn here creates new series.

`sam_asset_maintenance` is what lets the overview report *maintenance* as a
third state rather than counting a silenced room as an outage.

### 2.2 Firmware baseline

```prisma
model FirmwareBaseline {
  id              String   @id @default(cuid())
  typeId          String
  model           String?  // null = applies to every model of this type
  approvedVersion String
  notes           String?  @db.Text
  updatedAt       DateTime @updatedAt

  type AssetType @relation(fields: [typeId], references: [id], onDelete: Cascade)

  @@unique([typeId, model])
  @@map("firmware_baselines")
}
```

On `Asset`:

```prisma
firmwareVersion   String?
firmwareCheckedAt DateTime?
```

Most-specific match wins: exact `model` baseline, else the `model = null` row for
the type, else the asset is *unclassified* (not "compliant" — that distinction
matters for the NIS2 report).

### 2.3 Firmware sync job

`scripts/sync-firmware.ts`, run on a schedule alongside the existing maintenance
scripts. Queries Prometheus `/api/v1/query` for `device_firmware_info`, maps
`sam_hostname` → `version`, writes `firmwareVersion` / `firmwareCheckedAt`.

**Version comparison is the risky part.** AV firmware is not semver — Pearl uses
`4.18.1`, Crestron `1.0.0.1234`, some vendors ship `v2.3-build17`. Plan: a loose
comparator that splits on non-digits and compares numeric segments left to
right, falling back to string equality when the shapes differ. Anything it
cannot order is reported as *unknown*, never as compliant. Do not reach for a
semver library — it will reject most of these strings.

### 2.4 Compliance output

```
sam_asset_firmware_info{sam_hostname, version} 1
sam_asset_firmware_compliant{sam_hostname} 0|1     # absent when unclassified
sam_firmware_baseline_info{sam_asset_type, sam_model, version} 1
```

Plus counts on the existing NIS2 block: outdated, unclassified, never-seen. The
comparison lives in `lib/nis2-compliance.ts` so the SAM UI, the metrics
endpoint, and the exportable NIS2 report all read the same numbers.

### 2.5 Embedding

- Location detail page: embedded room panels (up/down, firmware status, 24 h
  availability) filtered by that location's FI number.
- Asset detail page: embedded device panels filtered by hostname, plus
  `firmwareVersion` and its baseline shown as plain fields.
- Both keep a "Open in Grafana" link for full-screen exploration.

Open question — Grafana auth for the iframe. Either anonymous read-only on the
internal network, or SAM reverse-proxies `/grafana/*` with a service-account
token. The proxy is more work but avoids an unauthenticated Grafana.

---

## 3. Prometheus rules

Recording rules do the room-level aggregation so overview panels stay fast and
alerts reuse the same expressions.

**Collapse to one series per asset first.** A device can be probed by more than
one job — blackbox for reachability plus a vendor exporter for detail — which
would produce two `probe_success` series for one `sam_hostname` and inflate
every room count. `max by (sam_hostname)` deduplicates and drops the
exporter-specific `job`/`instance` labels in one step. Everything downstream
consumes this rule, never raw `probe_success`.

One group, not two. Prometheus evaluates rules sequentially within a group but
runs groups concurrently, so the room rules must sit below the rule they consume
or they read a stale sample — briefly counting a device that just started
reporting as never scraped.

```yaml
groups:
  - name: sam_room
    rules:
      # One series per asset regardless of which exporter probed it, or how
      # many did. max() means "reachable by any probe". Must stay first.
      - record: sam_asset:probe_success
        expr: max by (sam_hostname) (probe_success)

      - record: room:assets_expected:count
        expr: count by (sam_fi_number) (sam_asset_info)

      # sam_asset:probe_success carries only sam_hostname, so join back onto
      # sam_asset_info to recover sam_fi_number. `and on()` keeps the left
      # side's labels.
      - record: room:assets_reporting:count
        expr: |
          count by (sam_fi_number) (
            sam_asset_info
            and on (sam_hostname) (sam_asset:probe_success == 1)
          )

      # Includes assets that were never scraped at all, which `probe_success == 0`
      # alone would miss.
      - record: room:assets_down:count
        expr: |
          count by (sam_fi_number) (
            sam_asset_info
            unless on (sam_hostname) (sam_asset:probe_success == 1)
            unless on (sam_hostname) sam_asset_maintenance
          )

      - record: room:firmware_outdated:count
        expr: count by (sam_fi_number) (sam_asset_firmware_compliant == 0)

      - record: room:health:ratio
        expr: room:assets_reporting:count / room:assets_expected:count
```

The room dashboard should split `room:assets_down:count` further for
troubleshooting — `probe_success == 0` (device answered the exporter with a
failure) versus no series at all (never scraped, likely an SD or template
problem). The overview treats both as down, which is correct there.

Alert rules (same Ansible role): room health below threshold, device down > 15 m
weighted by `sam_criticality`, firmware outdated > N days, asset past
end-of-support.

---

## 4. Dashboards — three, not one per room

A dashboard per room means thousands of generated JSON files that drift. Instead:

| UID | Purpose | Variables |
|---|---|---|
| `sam-fleet` | Totals: online/offline/maintenance, firmware up-to-date vs outdated vs unclassified, worst rooms table, EOS timeline | `campus`, `building` (optional filters) |
| `sam-room` | Every asset in one room: state, firmware, availability history | `fi_number` |
| `sam-device` | One device: probe history, firmware, plus conditional rows per asset type | `hostname` |

Navigation: fleet table rows carry a data link to `sam-room`, room rows to
`sam-device`. SAM's tree links straight to either with the variable prefilled
(`/d/sam-room/room?var-fi_number=14.10.100.013`).

The tree itself stays in SAM. Grafana has no tree panel, and the FI-number
labels (`sam_campus/building/floor/room`) already give Grafana-side users
chained variables that behave like one.

Conditional rows on `sam-device` use Grafana row repeat driven by a query on the
device's own metric names, so a type that exposes extra metrics gets extra rows
without a dashboard change.

---

## 5. Config as code

```
ops/
├── jsonnet/
│   ├── lib/sam.libsonnet          # shared panels, colours, thresholds
│   ├── dashboards/{fleet,room,device}.jsonnet
│   └── build.sh                   # → build/*.json
└── ansible/
    ├── roles/grafana_sam/
    │   ├── files/dashboards/*.json        # build output, committed
    │   ├── templates/provisioning/datasources.yaml.j2
    │   ├── templates/provisioning/dashboards.yaml.j2
    │   └── tasks/main.yml
    └── roles/prometheus_sam_rules/
        ├── files/sam-rules.yml
        └── tasks/main.yml
```

Grafana file provisioning (not the API modules) — no tokens needed, and
provisioned dashboards are read-only in the UI, which is what makes "recreate at
any time" true rather than aspirational. Datasource templates carry the
Prometheus URL and the SAM Infinity datasource with `PROMETHEUS_SD_TOKEN` from
Vault.

CI gate: `build.sh` output must be byte-identical to what is committed,
`promtool check rules` passes, and Grafana's dashboard JSON validates.

---

## 6. Phases

Each phase is independently shippable and independently verifiable.

**Phase 1 — label contract + per-asset series**
Add `sam_asset_info`, `sam_asset_maintenance`,
`sam_asset_end_of_support_timestamp`. Remove the `labelmap` from the documented
scrape config.
*Verify:* `sam_asset_info unless on(sam_hostname) probe_success` returns exactly
the assets that are genuinely not reporting; unit tests extend
`__tests__/api/prometheus-metrics.test.ts`.

**Phase 2 — recording rules + fleet dashboard** — built, see [`ops/`](../../ops/README.md)
Jsonnet library and `sam-fleet` dashboard, `prometheus_sam_rules` and
`grafana_sam` Ansible roles, recording + alert rules, promtool unit tests, and a
Grafana service in the dev stack that loads the built JSON.
*Verify:* `ops/jsonnet/build.sh && git diff --exit-code` proves the committed JSON
matches its source — passing. `promtool test rules` covers the
down / maintenance / never-scraped split and the double-probe collapse, but is
**written and not yet executed** (promtool was unavailable in the authoring
environment). Run it before the first deploy.

**Phase 3 — room + device dashboards, SAM deep links** — built
`sam-room` (keyed on `fi_number`) and `sam-device` (keyed on `hostname`, with
conditional vendor rows), data links wiring fleet → room → device, and a
`location.urlTemplate` setting in SAM.

*Deviation:* no `GRAFANA_BASE_URL` env var. SAM already had an admin-configurable
`hostname.urlTemplate` rendering a link on every hostname, which covers the
device link with no code at all; `location.urlTemplate` mirrors it for rooms.
That keeps one config mechanism instead of two, keeps Grafana's dashboard UIDs
out of the application, and lets an admin change the target without a redeploy.

*Verify:* clicking a location in SAM lands on `sam-room` with the correct
`fi_number` prefilled; fleet → room → device navigation works. 980 tests pass.

**Phase 4 — firmware baseline + sync + compliance**
Schema, admin UI for baselines, sync script, compliance metrics, NIS2 panel.
*Verify:* a seeded asset with a known-old version reports
`sam_asset_firmware_compliant 0`; an unmatched version reports *unclassified*,
not compliant. Comparator unit-tested against real vendor version strings.

**Phase 5 — embedding** — built
`d-solo` panels on the location and asset pages, fetched through SAM's reverse
proxy at `/api/grafana-embed/[dashboard]` with a Grafana service-account token.

*Auth decision:* proxy rather than anonymous Grafana. Grafana needs no
browser-reachable URL, the token never reaches the client, and SAM's session
gates access. The proxy is narrow by construction — allowlisted dashboards, UIDs
resolved server-side, only rendering parameters and `var-*` forwarded.

*Second correction, after measuring:* rendering was too slow to be useful — five
panels per page, each a headless-browser page load, uncached. Four of the five
were single numbers, which never needed a picture. SAM now queries the `room:*`
recording rules directly and renders the counts itself; only the time series is
an image, and those are cached for a minute. The lesson generalises: put in an
image only what a picture actually communicates.

*Correction after first build:* the first attempt framed `/d-solo/` and did not
work. That path serves the whole Grafana SPA, whose absolute asset and API paths
resolve against SAM inside the frame and 404 — and SAM's own
`X-Frame-Options: DENY` blocked the frame before that even surfaced. Switched to
Grafana's image renderer: `/render/d-solo/` returns a PNG, so there are no
assets to resolve, no frame, and no CSP exemption. Panels are static in exchange,
and each links through to the live dashboard.

*Verify:* panels render for a non-admin SAM user with no separate Grafana login.
Panel ids are asserted against the built dashboards by
`__tests__/lib/grafana-panels.test.ts`, so a dashboard reorder fails the build
rather than silently re-pointing every embed.

---

## Open questions

1. **Grafana auth for embedding** — anonymous read-only vs SAM reverse-proxy
   with a service account. Blocks phase 5 only.
2. **Renaming `pearl_probe_success` → `probe_success` in the custom exporters.**
   Blackbox-probed devices already emit the bare name. Until the custom
   exporters follow, a transitional recording rule bridges them:
   `record: sam_asset:probe_success`,
   `expr: max by (sam_hostname) ({__name__=~"(.+_)?probe_success"})`. The regex
   matcher is load-bearing while it exists, so treat it as temporary. Also
   confirm which exporters emit `device_firmware_info` — blackbox-only devices
   never will, and must report as *unclassified* rather than compliant (phase 4).
3. **Where does the sync job run?** A Nomad periodic job is the obvious fit
   given `sam.nomad`, but the existing maintenance scripts may already have a
   scheduling convention worth reusing.
4. **Version comparator semantics** — need a sample of real firmware strings per
   vendor before fixing the rules.

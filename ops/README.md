# ops — monitoring configuration as code

Prometheus rules and Grafana dashboards for the SAM monitoring stack. Everything
here is generated or deployed from source; nothing is edited in the Grafana UI or
on a Prometheus host.

Design rationale lives in [`doc/design/grafana-monitoring.md`](../doc/design/grafana-monitoring.md).

```
ops/
├── jsonnet/
│   ├── lib/sam.libsonnet            shared panel/layout helpers
│   ├── dashboards/*.jsonnet         one file per dashboard
│   └── build.sh                     → roles/grafana_sam/files/dashboards/*.json
└── ansible/
    ├── site.yml                     example playbook
    └── roles/
        ├── prometheus_sam_rules/    recording + alert rules, promtool tests
        └── grafana_sam/             datasources, dashboard provider, built JSON
```

## Requirements

| Tool | Used for | Install |
|---|---|---|
| `jsonnet` | building dashboards | [go-jsonnet releases](https://github.com/google/go-jsonnet/releases) |
| `promtool` | validating and unit-testing rules | ships with [Prometheus](https://prometheus.io/download/), or use the dev container (below) |
| `ansible-core` | deployment | `pipx install ansible-core` |

## Workflow

Edit jsonnet, rebuild, verify, deploy:

```bash
ops/jsonnet/build.sh
promtool test rules ops/ansible/roles/prometheus_sam_rules/tests/sam-rules_test.yml
ansible-playbook -i inventory.yml ops/ansible/site.yml
```

The built JSON is committed. CI must prove the committed output matches the
source, otherwise "recreate at any time" is only a claim:

```bash
ops/jsonnet/build.sh
git diff --exit-code ops/ansible/roles/grafana_sam/files/dashboards
promtool check rules ops/ansible/roles/prometheus_sam_rules/files/*.yml
promtool test rules ops/ansible/roles/prometheus_sam_rules/tests/sam-rules_test.yml
```

## Trying it locally

The dev stack runs Prometheus and Grafana against the same files this directory
deploys — the rules are bind-mounted from the role, and Grafana loads the built
dashboard JSON:

```bash
cd development && docker compose up --build
# Grafana    http://localhost:3001  (admin/admin) → Dashboards → SAM
# Prometheus http://localhost:9090
```

### Grafana on its own

If SAM, the database and Prometheus already run elsewhere, use the standalone
compose file. It defines no `depends_on`, so Compose cannot walk the
grafana → prometheus → app → db/vault chain:

```bash
cd development
SAM_PROMETHEUS_URL=http://host.docker.internal:9090 \
SAM_API_TOKEN="$PROMETHEUS_SD_TOKEN" \
  docker compose -f docker-compose.grafana.yml up -d

docker compose -f docker-compose.grafana.yml logs -f grafana   # watch startup
docker compose -f docker-compose.grafana.yml down              # stop
```

The main `docker-compose.yml` can also run Grafana alone via
`docker compose up -d --no-deps grafana`, but omitting `--no-deps` starts the
whole stack — the standalone file removes that trap.

Point the URLs at whatever Prometheus holds the SAM metrics — an internal
hostname works just as well as `host.docker.internal`. The dashboards need
nothing from SAM directly; only the *SAM Inventory* datasource uses
`SAM_BASE_URL`, and only for metadata lookup panels.

The Infinity datasource plugin is **not** installed by default — nothing built so
far uses it, and installing it needs outbound internet and disk on first start.
The *SAM Inventory* datasource will show as unavailable until you opt in with
`GF_INSTALL_PLUGINS=yesoreyeram-infinity-datasource`.

Two things to have in place first, or the dashboards will be blank:

1. **The recording rules must be loaded into that Prometheus.** Every panel reads
   `room:*`. Deploy `prometheus_sam_rules` to it, or for a quick look copy
   `roles/prometheus_sam_rules/files/*.yml` into its rules directory and
   `curl -XPOST <prometheus>/-/reload`.
2. **`sam_asset_info` must exist**, which means that Prometheus needs a
   `sam_inventory` scrape job against `/api/prometheus/metrics`. Without it the
   expected set is empty and every count reads zero.

Check both at once in the Prometheus UI: `count(sam_asset_info)` and
`count(room:assets_expected:count)` should be non-zero.

### Running promtool without installing it

The `prom/prometheus` image ships `promtool`, and the dev stack mounts this role
at `/opt/sam-rules`:

```bash
cd development
docker compose exec prometheus promtool test rules /opt/sam-rules/tests/sam-rules_test.yml
docker compose exec prometheus promtool check rules /etc/prometheus/rules/*.yml
```

### Iterating

Rebuild after editing jsonnet; Grafana re-reads within 30s. After editing rules,
`curl -XPOST localhost:9090/-/reload`.

### Device metrics in dev

Real AV devices are unreachable from a laptop, so the dev stack ships a
**mock exporter** (`development/mock-exporter/`). It follows the same
multi-target pattern as the production exporters: Prometheus asks it about one
device per scrape via `?target=`, and the `sam_*` labels come from SAM's service
discovery rather than from the exporter. So it exercises the real path —
scrape template → SD → labels → recording rules — instead of faking the output.

Point an asset type at it in **Administration → Asset Types → Edit template**:

```
__address__=mock-exporter:9101
__metrics_path__=/probe
__param_target={hostname_fqdn}
__param_module=recorder
```

`__param_module` is optional and selects the extra per-type metrics
(`recorder`, `projector`, or omit for none) that drive the device dashboard's
conditional rows.

State is derived from a hash of the hostname, so a device behaves the same
across restarts — roughly 75% always up, 15% always down, 10% flapping every two
minutes so the availability graphs move. Down devices report *only*
`probe_success 0`, matching real exporters.

**Leave at least one asset type without a template.** Those assets target their
hostname directly, which does not resolve, so no `probe_success` series is ever
created — that is the never-scraped case, and it is worth keeping visible.

## Why not Grafonnet

Three dashboards do not justify vendoring a large generated library, and
`sam.libsonnet` has no external dependencies — `jsonnet` alone builds it, with no
`jsonnet-bundler` step and no library version pinned to a Grafana release. The
tradeoff is that we own the dashboard schema knowledge rather than borrowing it.
If the dashboard count grows past a handful, revisit: `sam.libsonnet` covers only
the five panel types currently in use.

Emitted dashboards declare `schemaVersion: 39`. Grafana migrates older schemas
forward on load, so this stays valid across upgrades.

## Embedding panels in SAM

**Counts are queried, not rendered.** The device and availability numbers on
SAM's location and asset pages come from the `room:*` recording rules as JSON —
one request, milliseconds — and SAM renders them in its own styling. Only the
time-series charts are images. Rendering five numbers as five images made pages
take seconds, because every render is a full headless-browser page load.

SAM fetches the remaining charts through its own proxy at
`/api/grafana-embed/[dashboard]`, from Grafana's **image renderer**, as a PNG.
Results are cached in-process for `GRAFANA_RENDER_CACHE_MS` (default 60s, close
to the recording-rule interval), keyed on the full upstream URL so a different
room, device or time range is a different entry. SAM does
this server-side with a service-account token, so Grafana needs no
browser-reachable URL and no anonymous access, the token never reaches the
client, and access is gated by SAM's existing session.

Images rather than iframes: `/d-solo/` serves the whole Grafana SPA, and its
absolute asset and API paths would resolve against SAM inside a frame and 404.
Rendering server-side avoids that and needs no CSP exemption, since
`img-src 'self'` already permits it. Embedded panels are therefore static — each
links through to the live dashboard for tooltips and zoom.

Needs the grafana-image-renderer plugin (a sidecar container in the dev stack)
with `GF_RENDERING_SERVER_URL` set on Grafana.

```dotenv
GRAFANA_URL=http://grafana.internal:3000   # as reachable from the SAM server
GRAFANA_TOKEN=<service account token>      # Viewer role is enough
```

Grafana must also allow framing: `GF_SECURITY_ALLOW_EMBEDDING=true`.

**Panel ids are the fragile part.** They are assigned by position at build time
and SAM embeds them by id, so reordering panels re-points every embed — and an
embed showing the wrong panel renders a plausible chart of the wrong thing,
which is worse than an error. `lib/grafana.ts` records the id→title mapping and
`__tests__/lib/grafana-panels.test.ts` asserts it against the built JSON, so a
reorder fails the build instead of going unnoticed.

The proxy is an authenticated hole through to another service, so it stays
narrow: only the dashboards on its allowlist, UIDs resolved server-side rather
than taken from the request, only rendering parameters and `var-*` forwarded,
and `frame-ancestors 'self'` on the response.

## Conventions that matter

**Join on `sam_hostname`, never `instance` or `job`.** Each asset type is scraped
through its own exporter, and every blackbox-probed device shares one exporter
instance, so those labels identify the exporter rather than the device.

**Collapse probes before counting.** A device can be probed by blackbox *and* a
vendor exporter. `sam_asset:probe_success` applies `max by (sam_hostname)` so
room counts don't double-count it. Consume that rule, not raw `probe_success`.

**Keep dependent rules in one group.** Prometheus evaluates rules sequentially
*within* a group but runs groups concurrently, so a rule that consumes another
rule's output must sit below it in the same group. Splitting them makes counts
lag by an evaluation and, worse, briefly report a healthy device as never
scraped. promtool tests will not catch it — they evaluate rule files in file
order, which is exactly the guarantee a cross-group dependency lacks.

Some lag is unavoidable regardless: the rollups are recorded once a minute, so
the dashboard's counts trail the live device table by up to `interval`. A newly
configured device also has to wait for a service-discovery refresh and a scrape
before any probe series exists at all.

**`sam_asset_info` is the expected set.** It comes from SAM's inventory rather
than from what Prometheus happens to be scraping, which is what lets a room in
maintenance stay visible-but-silenced and a never-discovered device show up as
missing instead of absent.

**Panel ids must stay stable.** SAM embeds panels as
`/d-solo/<uid>?panelId=<id>`, and ids are assigned by position. Append panels to
the end of a row rather than inserting into the middle.

## Dashboards

| UID | Purpose | Variables |
|---|---|---|
| `sam-fleet` | Totals, worst rooms, inventory shape, lifecycle | `campus`, `building` |
| `sam-room` | Every device in one room, with its state | `fi_number` |
| `sam-device` | One device, plus rows for the metrics its type exposes | `hostname` |

Drill-down runs fleet → room → device via data links on the FI number and
hostname columns. Both also open directly with the variable prefilled:

```
/d/sam-room/room?var-fi_number=14.10.100.013
/d/sam-device/device?var-hostname=rec9092001.private.ugent.be
```

### Linking from SAM

SAM keeps the location tree and the asset pages as the place people navigate
from; Grafana is reached through the URL-template settings under
**Administration → Settings**. No Grafana-specific configuration exists in SAM —
these are the same generic templates used for any external system.

| Setting | Set it to | Appears on |
|---|---|---|
| Location URL template | `https://grafana.example.com/d/sam-room/room?var-fi_number={fi_number}` | A *Monitoring* badge on the location detail page |
| Hostname URL template | `https://grafana.example.com/d/sam-device/device?var-hostname={hostname}` | The hostname on the asset detail page and in asset tables |

A location with no FI number shows no link when the template uses
`{fi_number}` — there would be no room for Grafana to resolve.

### Conditional rows

Grafana has no "show this row only if the device exposes these metrics", so each
vendor row on `sam-device` repeats over a hidden variable that resolves to one
value when the metric family is present and none when it is not — repeating zero
times is the closest equivalent to hiding.

Each family therefore has to be named in `device.jsonnet`: an `existsVar` plus a
row. The Recorder pair is the template to copy. A fully generic version is not
achievable without a Grafana plugin, and showing empty panels for every device
that lacks a family would be worse.

### Device state

The room table and the device dashboard fold four conditions into one value,
because a device in maintenance and a device that was never scraped both have no
probe series and `probe_success` alone cannot tell them apart:

| Value | Meaning |
|---|---|
| `1` | Reporting |
| `0` | Probed and failed |
| `2` | Room in maintenance |
| *no series* | Never scraped |

### Firmware currency

Only `status="outdated"` is a violation. `unclassified` (no baseline configured)
and `no_data` (device has no API, or has not answered) are counted as
*unmeasured* — reporting either as compliant would overstate NIS2 coverage.

Blackbox-probed devices have no API and will sit in `no_data` permanently, so
the fleet dashboard shows *Measured coverage* — the share of assets whose
currency can actually be judged. That is the denominator every other firmware
figure should be read against.

Baselines live in SAM (`FirmwareBaseline`, keyed on asset type and optionally
model), edited under **Administration → Firmware Baselines**, and
published as `sam_firmware_baseline_info` so a dashboard can show what was
expected alongside what is installed.

## Status

Built: recording rules, alert rules, promtool tests, all three dashboards,
firmware currency.

Devices with no API are recorded by hand on the asset page (`source=ATTESTED`).
Attestations age out like any other evidence, so `no_data` now means "nothing has
ever been established" rather than "we cannot tell".

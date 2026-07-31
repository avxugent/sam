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

## Conventions that matter

**Join on `sam_hostname`, never `instance` or `job`.** Each asset type is scraped
through its own exporter, and every blackbox-probed device shares one exporter
instance, so those labels identify the exporter rather than the device.

**Collapse probes before counting.** A device can be probed by blackbox *and* a
vendor exporter. `sam_asset:probe_success` applies `max by (sam_hostname)` so
room counts don't double-count it. Consume that rule, not raw `probe_success`.

**`sam_asset_info` is the expected set.** It comes from SAM's inventory rather
than from what Prometheus happens to be scraping, which is what lets a room in
maintenance stay visible-but-silenced and a never-discovered device show up as
missing instead of absent.

**Panel ids must stay stable.** SAM embeds panels as
`/d-solo/<uid>?panelId=<id>`, and ids are assigned by position. Append panels to
the end of a row rather than inserting into the middle.

## Status

Built: recording rules, alert rules, promtool tests, `sam-fleet` dashboard.

Not built yet: the room and device dashboards (phase 3) and everything firmware
(phase 4). The fleet dashboard has no firmware panels on purpose — the metrics
that back them don't exist yet, and empty panels teach users to distrust the
dashboard.

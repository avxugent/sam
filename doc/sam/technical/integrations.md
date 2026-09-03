---
title: "Integrations"
sync_to_confluence: true
---

# Integrations

SAM integrates with several external systems. All integrations are optional and activated only when their respective environment variables are set.

---

## Prometheus

SAM exposes three endpoints that connect to your monitoring stack. All require `PROMETHEUS_SD_TOKEN` to be set — if not, endpoints return HTTP 503.

### Setup

```bash
# Generate a token
openssl rand -base64 32
# Add to .env:
PROMETHEUS_SD_TOKEN="<generated-token>"
```

---

### Endpoint 1: HTTP Service Discovery (`/api/prometheus/sd`)

Returns every installed asset with a hostname as a Prometheus `http_sd_configs` target group, labelled with SAM metadata. Prometheus polls this endpoint and attaches the labels to all metrics scraped from those devices.

Excluded from the target list: assets whose type has Prometheus exposure disabled, and assets in a **room that is in maintenance** (`Location.inMaintenance`). Placing a room in maintenance is the intended way to temporarily stop scraping its devices without decommissioning them; clearing the flag makes the targets reappear.

**Labels attached to each target:**

| Label | Example | Description |
|---|---|---|
| `sam_hostname` | `projector-room101` | Asset hostname |
| `sam_fi_number` | `14.10.100.013` | Full FI number from the location |
| `sam_campus` | `14` | Campus code |
| `sam_building` | `10` | Building code |
| `sam_floor` | `100` | Floor code |
| `sam_room` | `013` | Room code |
| `sam_location_name` | `Room 013` | Human-readable room name |
| `sam_location_path` | `Campus A / Building 10 / Room 013` | Full path |
| `sam_asset_type` | `Projector` | Asset type |
| `sam_manufacturer` | `Epson` | Manufacturer name |
| `sam_model` | `EB-W06` | Model |

**Prometheus configuration:**

```yaml
scrape_configs:
  - job_name: "av_devices"
    http_sd_configs:
      - url: "https://sam.example.com/api/prometheus/sd"
        refresh_interval: 5m
        authorization:
          type: Bearer
          credentials: "<PROMETHEUS_SD_TOKEN>"
```

Prometheus attaches every non-`__` label from the SD target group to the scraped
series automatically, so no `labelmap` rule is needed.

Avoid a `regex: "sam_(.*)" / action: labelmap` rule in particular. `labelmap`
*copies* labels rather than renaming them, so it leaves every device series
carrying both `sam_model` and `model`, `sam_hostname` and `hostname`, and so on
— doubled label cardinality for no gain, and the unprefixed copies can collide
with labels an exporter sets natively. Query and join on the `sam_*` names.

**Example PromQL queries:**

```promql
# Projectors in campus 14 that are unreachable
up{sam_campus="14", sam_asset_type="Projector"} == 0

# Average probe duration by building
avg by (sam_building) (probe_duration_seconds{sam_campus="14"})
```

---

### Endpoint 2: Inventory Metrics (`/api/prometheus/metrics`)

Exposes SAM inventory counts in Prometheus text format — useful for tracking inventory trends in Grafana over time.

**Prometheus configuration:**

```yaml
scrape_configs:
  - job_name: "sam_inventory"
    metrics_path: /api/prometheus/metrics
    scheme: https
    authorization:
      type: Bearer
      credentials: "<PROMETHEUS_SD_TOKEN>"
    static_configs:
      - targets: ["sam.example.com"]
```

**Metrics:**

| Metric | Type | Description |
|---|---|---|
| `sam_assets_total` | gauge | Total assets |
| `sam_locations_total` | gauge | Total locations |
| `sam_assets_without_hostname_total` | gauge | Assets with no hostname (monitoring gap) |
| `sam_assets_without_fi_number_total` | gauge | Assets in locations missing an FI number |
| `sam_assets_by_type{type="…"}` | gauge | Assets per asset type |
| `sam_assets_by_manufacturer{manufacturer="…"}` | gauge | Assets per manufacturer |
| `sam_assets_by_campus{campus="…"}` | gauge | Assets per campus code |
| `sam_locations_without_fi_number_total` | gauge | Locations with no FI number |
| `sam_assets_missing_owner` | gauge | Installed assets without a responsible owner (NIS2) |
| `sam_assets_missing_criticality` | gauge | Installed assets without an effective criticality (NIS2) |
| `sam_assets_past_end_of_support` | gauge | Installed assets past their end-of-support date (NIS2) |
| `sam_assets_no_end_of_support_date` | gauge | Installed assets without an end-of-support date |
| `sam_locations_missing_review` | gauge | Leaf locations missing the configured inventory-review work-log entry within the review period (omitted when not configured) |
| `sam_users_credentials_without_2fa` | gauge | Local accounts without TOTP 2FA |
| `sam_audit_forward_backlog` | gauge | Audit rows not yet forwarded to syslog |
| `sam_asset_info{sam_hostname="…", …}` | gauge | Always `1`. One series per asset expected to report, carrying its SAM metadata |
| `sam_asset_maintenance{sam_hostname="…"}` | gauge | Always `1`. Asset's room is in maintenance, so missing metrics are expected |
| `sam_asset_end_of_support_timestamp{sam_hostname="…"}` | gauge | End-of-support date as a Unix timestamp |

#### `sam_asset_info` — the expected-set series

Service discovery only advertises devices that *should* be scraped, so `up == 0`
can never tell you about an asset Prometheus has never seen — and rooms in
maintenance are dropped from SD entirely, so their assets disappear rather than
showing as down.

`sam_asset_info` closes that gap: one series per `INSTALLED` asset that has a
hostname and a Prometheus-exposed type, regardless of maintenance state. Its
labels (`sam_hostname`, `sam_fi_number`, `sam_campus`, `sam_building`,
`sam_floor`, `sam_room`, `sam_location_path`, `sam_location_name`,
`sam_asset_type`, `sam_manufacturer`, `sam_model`, `sam_criticality`) match the
SD group labels exactly, so it joins directly against device metrics:

```promql
# One probe result per asset. A device may be probed by several jobs (blackbox
# for reachability plus a vendor exporter for detail), so collapse first —
# otherwise room counts double-count it.
max by (sam_hostname) (probe_success)

# Assets that should be reporting but are not (excluding maintenance).
# Catches assets never scraped at all, which probe_success == 0 alone misses.
sam_asset_info
  unless on (sam_hostname) (max by (sam_hostname) (probe_success) == 1)
  unless on (sam_hostname) sam_asset_maintenance

# Expected vs reporting, per room
count by (sam_fi_number) (sam_asset_info)
count by (sam_fi_number) (
  sam_asset_info and on (sam_hostname) (max by (sam_hostname) (probe_success) == 1)
)
```

Join on `sam_hostname`, never on `instance` or `job` — each asset type is
scraped through its own exporter, so those labels identify the exporter rather
than the device. Unrelated blackbox jobs also emit `probe_success`, but they
carry no `sam_*` labels and so never match these joins.

Every label is always present — empty string when unknown — so the series shape
is stable and `count by (…)` never silently splits.

`sam_criticality` is the *effective* criticality: the per-asset override when
set, otherwise the asset type's default.

---

### Endpoint: Inventory Snapshot (`/api/export/snapshot`)

Point-in-time JSON snapshot of the full inventory (assets including owner, criticality, end-of-support, supplier and disposal fields; suppliers; locations) with record counts and a generation timestamp. Authenticated with a session **or** `Bearer EXPORT_TOKEN`, so an external cron can archive dated snapshots as NIS2 evidence:

```bash
curl -H "Authorization: Bearer $EXPORT_TOKEN" \
  https://sam.example.com/api/export/snapshot -o "sam-inventory-$(date +%F).json"
```

`scripts/export-backup.mjs` produces the same snapshot plus a SHA-256 manifest — see [Scripts](scripts.md).

---

### Scrape Target Templates

Many AV devices cannot expose Prometheus metrics directly and are monitored via an external exporter. The scrape template system configures, per asset type, how Prometheus reaches each device.

**Configure in:** Administration → Asset Types → expand a type → Edit template

**Per-brand overrides:** Different manufacturers under the same asset type sometimes need different exporters or endpoints. A manufacturer under an asset type's expanded panel can be given its own template, which takes priority over the type's default. Overrides are managed alongside the default template in the same Asset Types panel, via `POST`/`PUT`/`DELETE` on `/api/asset-types/[id]/manufacturer-templates` and `/api/asset-types/manufacturer-templates/[id]`.

**Per-model overrides:** Within a manufacturer, a specific model can be given an even more specific template — useful when one model in a brand's lineup exposes metrics differently from the rest. Model overrides are matched against `Asset.model` case-insensitively (trimmed), since model is a free-text field rather than a lookup table. Managed via `POST`/`PUT`/`DELETE` on `/api/asset-types/[id]/model-templates` and `/api/asset-types/model-templates/[id]`.

**Resolution order** for a given asset, most specific wins: model-specific override (matching the asset's type, manufacturer, **and** model) → manufacturer-specific override (matching the asset's type **and** manufacturer) → the asset type's default template → no template (asset scraped directly by hostname). Implemented in `resolveScrapeTemplate()` in `lib/scrape-template.ts`.

**Format:** One `key=value` pair per line. Keys override Prometheus `__labels__`. Comments start with `#`.

**Available variables:**

| Variable | Replaced with |
|---|---|
| `{hostname_fqdn}` | Asset hostname |
| `{serial}` | Asset serial number |
| `{model}` | Asset model |
| `{manufacturer}` | Manufacturer name |
| `{fi_number}` | Location FI number |
| `{vault_path}` | The asset's Vault path — a **non-secret reference**, not the credential |

> **Credentials never appear in the SD output.** SAM does not read device
> passwords. The template passes only the `{vault_path}` reference; the external
> exporter reads the secret from Vault itself and uses it to scrape the device.

**Example — Pearl recorder exporter:**

```
__address__=https://pearlexporter.example.com
__metrics_path__=/probe
__param_target=https://{hostname_fqdn}
__param_vault_path={vault_path}
```

This tells Prometheus to scrape:
```
https://pearlexporter.example.com/probe?target=https://device001.example.com&vault_path=secret/av/device001
```

The exporter receives `vault_path`, looks up `username`/`password` in Vault
(using its own Vault credentials), and authenticates to the device. No password
is ever present in the SD JSON, in Prometheus, or in its debug pages/logs.

When a template sets `__address__`, that address — not the device hostname —
becomes the scrape target, so Prometheus queries the exporter rather than the
device. Any `https://`/`http://` scheme on `__address__` is lifted into the
`__scheme__` label automatically (Prometheus requires `__address__` to be
`host[:port]` only).

Assets of a type **without** a template use their hostname directly as the scrape target.

---

### Endpoint 3: Hostname Lookup (`/api/assets/by-hostname`)

Returns full SAM metadata for a given hostname. Designed for the Grafana Infinity datasource.

```
GET /api/assets/by-hostname?hostname=projector-room101
Authorization: Bearer <PROMETHEUS_SD_TOKEN>
```

Accepts session cookie **or** Bearer token — making it usable from both browser-based Grafana panels and direct API calls.

---

## HashiCorp Vault

Vault is the **machine source of truth** for per-device credentials. The external
exporter reads each device's secret from Vault at scrape time, keyed by the
`{vault_path}` reference SAM emits in the SD output (see *Scrape Target
Templates* above). **SAM itself does not read device passwords** — its only Vault
use is the asset-form **Test** button, which lists key names (never values) so an
operator can confirm a path before the exporter relies on it.

> **Source-of-truth split.** End users keep these passwords in **Bitwarden**
> (browser autofill, easy UX); machines read them from **Vault**. The two stores
> are maintained independently today — when a credential changes, update both.
> Bitwarden Password Manager is zero-knowledge, so there is no server-side API to
> read item passwords; a one-way Bitwarden→Vault sync would remove the
> double-entry but is not currently implemented.

The exporter needs its **own** Vault credentials (token or AppRole) to resolve
secrets. The `VAULT_*` variables below configure SAM's Test button only.

### Configuration

```dotenv
VAULT_ADDR="https://vault.example.com"
VAULT_KV_VERSION="v2"
# Token auth:
VAULT_TOKEN="s.xxxxxxxxxxxx"
# Or AppRole auth (recommended for production):
VAULT_ROLE_ID="<role-id>"
VAULT_SECRET_ID="<secret-id>"
VAULT_APPROLE_MOUNT="approle"
```

AppRole takes precedence when both `VAULT_TOKEN` and AppRole vars are set.

### Per-asset Vault path

Set in the asset edit form → "Vault Credentials" section. Example path: `secret/av/device001`.

```bash
# Write a secret (KV v2)
vault kv put secret/av/device001 username=admin password='s3cret'
```

### Test button

In the asset form, click **Test** next to the Vault path field. SAM verifies connectivity and returns the key names (never values).

### Graceful degradation

The SD endpoint never reads Vault, so Vault availability does not affect SD
generation. If the exporter cannot resolve a secret at scrape time, the device's
probe simply fails — alertable in Prometheus via `up == 0`.

The Vault client (`lib/vault.ts`, used by the Test button) uses native `fetch`,
returns `null` on any error, and never throws.

---

## Grafana

SAM provides a Grafana Infinity datasource-compatible API at `/api/grafana/*`. This allows Grafana to query SAM data for custom dashboard panels.

### Setup

1. Install Infinity plugin: `grafana-cli plugins install yesoreyeram-infinity-datasource`
2. Add datasource → type **Infinity**
3. Set Authentication: Custom HTTP Headers → `Authorization: Bearer <PROMETHEUS_SD_TOKEN>`
4. Use SAM endpoints as data sources in panels

### Hostname lookup panel

```
URL: https://sam.example.com/api/assets/by-hostname?hostname=${hostname_var}
```

Where `${hostname_var}` is a Grafana dashboard variable populated from the selected device.

---

## JIRA

Read-only integration. When a work log entry includes a JIRA issue key (e.g., `AVT-123`), SAM fetches and displays the issue summary and status.

### Configuration

```dotenv
JIRA_BASE_URL="https://yourorg.atlassian.net"
JIRA_EMAIL="user@example.com"
JIRA_API_TOKEN="<api-token>"
```

Generate an API token at: https://id.atlassian.com/manage-profile/security/api-tokens

### What it shows

- Issue summary (title)
- Current status (e.g., "In Progress", "Done")
- Link to the issue in JIRA

If JIRA is unavailable, the work log entry displays normally without the badge — the integration never blocks UI rendering.

---

## S3 Storage

By default, attachments are stored on the local filesystem (`UPLOAD_DIR`). To use S3 or an S3-compatible service:

```dotenv
STORAGE_DRIVER="s3"
S3_BUCKET="my-sam-bucket"
S3_REGION="us-east-1"
```

For S3-compatible providers (MinIO, Cloudflare R2, Backblaze B2):

```dotenv
S3_ENDPOINT="https://s3.eu-west-1.amazonaws.com"  # or http://minio:9000
S3_FORCE_PATH_STYLE="true"                         # required for MinIO, R2
```

The daily CSV backup script (`scripts/export-backup.mjs`) writes to S3 when `STORAGE_DRIVER=s3`, using the prefix from `EXPORT_S3_PREFIX` (default: `backups/`).

---

## Syslog / Audit Forwarding

Every `AuditLog` write can be forwarded to an rsyslog server for centralized log management.

```dotenv
SYSLOG_HOST="logs.example.com"
SYSLOG_PORT="514"
SYSLOG_TRANSPORT="udp"   # udp | tcp | tls
```

Failed forwards (network errors, timeouts) are retried by `scripts/forward-audit.mjs`. Run it as a cron job:

```cron
*/5 * * * * node /app/scripts/forward-audit.mjs
```

The script picks up all `AuditLog` rows where `forwardedAt IS NULL` and retries delivery.

For TLS:

```dotenv
SYSLOG_TRANSPORT="tls"
SYSLOG_PORT="6514"
SYSLOG_CA_BUNDLE="/etc/ssl/certs/syslog-ca.pem"
SYSLOG_TLS_REJECT_UNAUTHORIZED="true"
```

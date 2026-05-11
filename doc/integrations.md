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

Returns every asset with a hostname as a Prometheus `http_sd_configs` target group, labelled with SAM metadata. Prometheus polls this endpoint and attaches the labels to all metrics scraped from those devices.

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
    relabel_configs:
      - regex: "sam_(.*)"
        action: labelmap
```

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

---

### Scrape Target Templates

Many AV devices cannot expose Prometheus metrics directly and are monitored via an external exporter. The scrape template system configures, per asset type, how Prometheus reaches each device.

**Configure in:** Administration → Asset Types → expand a type → Edit template

**Format:** One `key=value` pair per line. Keys override Prometheus `__labels__`. Comments start with `#`.

**Available variables:**

| Variable | Replaced with |
|---|---|
| `{hostname_fqdn}` | Asset hostname |
| `{serial}` | Asset serial number |
| `{model}` | Asset model |
| `{manufacturer}` | Manufacturer name |
| `{fi_number}` | Location FI number |
| `{vault_<key>}` | Value of `<key>` from the Vault secret at the asset's Vault path |

**Example — Pearl recorder exporter:**

```
__address__=https://pearlexporter.example.com
__metrics_path__=/probe
__param_target__=https://{hostname_fqdn}
__param_user__={vault_username}
__param_password__={vault_password}
```

This tells Prometheus to scrape:
```
https://pearlexporter.example.com/probe?target=https://device001.example.com&user=admin&password=...
```

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

Required only when Prometheus scrape templates use `{vault_*}` placeholders. SAM fetches per-device credentials from Vault at SD refresh time.

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

If Vault is unavailable or a path is missing:
- The asset still appears in the SD output
- Credential values are empty
- `sam_vault_missing="true"` label is added — alertable in Prometheus

The Vault client (`lib/vault.ts`) uses native `fetch`, returns `null` on any error, and never throws. Vault errors never crash the SD endpoint for all targets.

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

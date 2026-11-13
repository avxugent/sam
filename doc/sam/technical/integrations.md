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
| `sam_assets_total` | gauge | Installed assets (in-repair and decommissioned assets are not counted) |
| `sam_locations_total` | gauge | Total locations |
| `sam_assets_without_hostname_total` | gauge | Installed assets with no hostname (monitoring gap) |
| `sam_assets_without_fi_number_total` | gauge | Assets with no FI number on their location or any ancestor |
| `sam_assets_by_type{type="…"}` | gauge | Assets per asset type |
| `sam_assets_by_manufacturer{manufacturer="…"}` | gauge | Assets per manufacturer |
| `sam_assets_by_campus{campus="…"}` | gauge | Assets per campus code (from the nearest FI number, inherited from ancestors) |
| `sam_locations_without_fi_number_total` | gauge | Locations with no FI number |
| `sam_assets_missing_owner` | gauge | Installed assets without a responsible owner (NIS2) |
| `sam_assets_missing_criticality` | gauge | Installed assets without an effective criticality (NIS2) |
| `sam_assets_past_end_of_support` | gauge | Installed assets past their end-of-support date (NIS2) |
| `sam_assets_no_end_of_support_date` | gauge | Installed assets without an end-of-support date |
| `sam_locations_missing_review` | gauge | Leaf locations missing the configured inventory-review work-log entry within the review period (omitted when not configured) |
| `sam_users_credentials_without_2fa` | gauge | Local accounts with neither TOTP nor a passkey |
| `sam_audit_forward_backlog` | gauge | Audit rows not yet forwarded to syslog |
| `sam_asset_info{sam_hostname="…", …}` | gauge | Always `1`. One series per asset expected to report, carrying its SAM metadata |
| `sam_asset_maintenance{sam_hostname="…"}` | gauge | Always `1`. Asset's room is in maintenance, so missing metrics are expected |
| `sam_asset_end_of_support_timestamp{sam_hostname="…"}` | gauge | End-of-support date as a Unix timestamp |
| `sam_worklog_items_by_location{sam_fi_number="…", sam_location_path="…", sam_location_name="…"}` | gauge | Number of work-log entries recorded per room |

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

Point-in-time JSON snapshot of the full inventory (assets including owner, criticality, end-of-support, supplier and disposal fields; suppliers; locations) with record counts and a generation timestamp. Authenticated with an ADMIN session **or** `Bearer EXPORT_TOKEN`, so an external cron can archive dated snapshots as NIS2 evidence:

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

**Per-model overrides:** Within a manufacturer, a specific model can be given an even more specific template — useful when one model in a brand's lineup exposes metrics differently from the rest. Model overrides are matched against the asset's resolved `Model.name` case-insensitively (trimmed) — this override table's own `model` column is intentionally still free text, since the string-equality match is unaffected by where the compared string comes from. Managed via `POST`/`PUT`/`DELETE` on `/api/asset-types/[id]/model-templates` and `/api/asset-types/model-templates/[id]`.

**Resolution order** for a given asset, most specific wins: model-specific override (matching the asset's type, manufacturer, **and** model) → manufacturer-specific override (matching the asset's type **and** manufacturer) → the asset type's default template → no template (asset scraped directly by hostname). Implemented in `resolveScrapeTemplate()` in `lib/prometheus/scrape-template.ts`.

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

The Vault client (`lib/integrations/vault.ts`, used by the Test button) uses native `fetch`
and never throws. It tells a missing secret (404 from the Test button) apart from a refused
token or an unreachable Vault (502), so the asset form shows which one it is.

---

## Grafana

SAM talks to Grafana in two ways, both authenticated with `Authorization: Bearer <PROMETHEUS_SD_TOKEN>`.

### SimpleJSON datasource (`/api/grafana/*`)

`/api/grafana/*` implements the Grafana SimpleJSON datasource protocol: `GET /api/grafana` (health check) and `POST` to `search`, `query`, `tag-keys` and `tag-values`. It accepts the Bearer token only, no session. Targets: `assets_table`, `assets_by_type`, `assets_by_manufacturer`, `assets_by_location`, `assets_by_install_year`; ad-hoc filters on `type`, `manufacturer`, `location` and `hostname`. Only active (INSTALLED) assets are returned. Details: [API Reference → Grafana](api-reference.md#grafana).

Setup: add a SimpleJSON-compatible datasource with URL `https://sam.example.com/api/grafana` and a custom HTTP header `Authorization: Bearer <PROMETHEUS_SD_TOKEN>`.

### Hostname lookup panel (Infinity datasource)

`/api/assets/by-hostname` is meant for the Infinity datasource (it also accepts a session):

1. Install the Infinity plugin: `grafana-cli plugins install yesoreyeram-infinity-datasource`
2. Add datasource → type **Infinity**
3. Set Authentication: Custom HTTP Headers → `Authorization: Bearer <PROMETHEUS_SD_TOKEN>`
4. Use the URL below in a panel

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

## MCP (AI assistants)

SAM exposes a read-only [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp`, so an AI assistant can answer questions such as "what is in room X" or "where do we have model Y".

1. Each user creates a key under **Settings → Profile → API keys** (name, optional expiry up to 365 days). The key (`sam_mcp_…`) is shown once. Treat it like a password: a key that has been pasted into a chat, ticket or repository should be revoked and replaced.
2. Point the client at the endpoint with the key as a Bearer token. The sections below cover Claude Code, Claude Desktop and other agents.

In the examples, `https://sam.example.org` is your SAM base URL and `sam_mcp_…` is the key.

### Claude Code

```bash
claude mcp add --scope user --transport http sam https://sam.example.org/api/mcp \
  --header "Authorization: Bearer sam_mcp_…"
```

- `--scope user` makes the server available in every project. The default (`local`) applies only to the directory you ran the command in; `--scope project` writes a `.mcp.json` that is meant to be committed, so never put a literal key in it.
- To keep the key out of shell history, export it first and let the shell expand it: `export SAM_MCP_KEY=sam_mcp_…`, then `--header "Authorization: Bearer $SAM_MCP_KEY"`. The expanded value is stored in your Claude config.
- A shared `.mcp.json` can read the key from each user's environment instead of containing it:

```json
{
  "mcpServers": {
    "sam": {
      "type": "http",
      "url": "https://sam.example.org/api/mcp",
      "headers": { "Authorization": "Bearer ${SAM_MCP_KEY}" }
    }
  }
}
```

- Check it with `claude mcp list` (the server should show as connected) or `/mcp` inside a session. A server added or changed during a session loads on the next start (`claude --continue` resumes the conversation). After rotating a key, remove and re-add the server (`claude mcp remove sam -s user`), then reconnect with `/mcp`.

### Claude Desktop

Claude Desktop's config file starts local servers, so a remote server like SAM is reached through the [`mcp-remote`](https://github.com/geelen/mcp-remote) bridge, which runs on your machine and forwards to the endpoint with the header attached. It needs Node.js on that machine. Open **Settings → Developer → Edit Config** (`claude_desktop_config.json`; macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`) and add:

```json
{
  "mcpServers": {
    "sam": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://sam.example.org/api/mcp", "--header", "Authorization:${SAM_AUTH}"],
      "env": { "SAM_AUTH": "Bearer sam_mcp_…" }
    }
  }
}
```

The header value goes in `env` and is referenced as `${SAM_AUTH}` because Claude Desktop on Windows mishandles spaces inside `args`. Quit Claude Desktop completely (not just the window) and start it again; the config is only read at launch. If `sam` does not appear, run the same `npx -y mcp-remote …` command in a terminal to see the error that Claude Desktop hides.

Recent Claude versions can also add a remote server under **Settings → Connectors → Add custom connector**, and Anthropic documents a *request header* field there for a fixed credential (enter `Bearer sam_mcp_…`, including the word `Bearer`). Whether that field is present depends on your version and plan, and custom connectors may be reached from Anthropic's infrastructure rather than from your machine, which would need an endpoint that is reachable from the internet (check Anthropic's [custom connector documentation](https://claude.com/docs/connectors/custom)). The `mcp-remote` entry above runs locally, so it also works for an instance that is only reachable inside your network.

### Other AI agents and MCP clients

Anything that speaks MCP over HTTP can use SAM:

| Setting | Value |
|---|---|
| URL | `https://<your SAM host>/api/mcp` |
| Transport | Streamable HTTP, stateless, JSON responses (no SSE stream, no sessions) |
| Method | `POST` only (`GET` and `DELETE` return `405`) |
| Authentication | Header `Authorization: Bearer sam_mcp_…`. There is no OAuth flow, and a browser session cookie is not accepted |
| Request headers | `Content-Type: application/json` and `Accept: application/json, text/event-stream` |
| Rate limit | 120 requests per minute per key; beyond that the server answers `429` with a `Retry-After` header |

- Clients that take a JSON config usually want the same fields as the `.mcp.json` example above (`type`/`transport` `http` or `streamable-http`, `url`, `headers`); the key names differ per client, so check its documentation.
- A client that can only start local (stdio) servers can use the same bridge as Claude Desktop: `npx -y mcp-remote https://sam.example.org/api/mcp --header "Authorization:Bearer sam_mcp_…"`.
- To test a key without a client, list the tools with curl: `curl -s -X POST https://sam.example.org/api/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer sam_mcp_…" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` should return the eleven tools.
- Error meanings: `401` is a missing, wrong, revoked or expired key (or the proxy stripped the `Authorization` header); `405` means the client used `GET`; `429` is the rate limit.

### What a key can do

A key acts as its owner and can only read. It never returns the Vault path, notes, invoice data or user references. Keys are stored as SHA-256 hashes; creating and revoking them is written to the audit log. Revoke a key to cut a client off immediately; deleting the user removes their keys.

**Custom fields are returned.** `get_asset` includes an asset's custom fields (every key and value) in its response. Unlike the Vault path, notes and invoice data, they are free-form and are not filtered, so anything typed into a custom field is visible to every key holder, whatever their role (a viewer can see the same fields in the UI). Keep credentials, licence keys and other secrets out of custom fields.

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
*/5 * * * * cd /app && node --import tsx/esm scripts/forward-audit.mjs
```

The script picks up all `AuditLog` rows where `forwardedAt IS NULL` and retries delivery.

For TLS:

```dotenv
SYSLOG_TRANSPORT="tls"
SYSLOG_PORT="6514"
SYSLOG_CA_BUNDLE="/etc/ssl/certs/syslog-ca.pem"
SYSLOG_TLS_REJECT_UNAUTHORIZED="true"
```

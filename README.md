# SAM – Simple Asset Management

A modern, self-hosted web application for managing AV hardware assets across physical rooms and facilities.

---

## Features

- **Multi-tier location tree** — unlimited depth (Campus → Building → Floor → Room → …)
- **Asset management** — Type, Manufacturer, Model (autocomplete), Serial Number, MAC addresses, Hostname, Installation/Invoice dates, Notes, unlimited custom key/value fields
- **File attachments** — photos and documents on locations and assets (drag & drop)
- **Cover images** — pin an image attachment as the hero photo for a location
- **Map & Address** — geocode locations with OpenStreetMap (no API key required)
- **CSV import** — bulk-import from legacy spreadsheet exports
- **Roles** — Admin / Editor / Viewer
- **MCP server** — read-only `/api/mcp` endpoint for AI assistants, with per-user API keys
- **SSO** — Microsoft Entra ID (Azure AD) via OAuth2, alongside local credentials
- **Docker** — multi-stage production image, full `docker-compose.yml`

---

## Quick Start (Local Development)

### 1. Start MySQL

```bash
# Dev-only compose (MySQL only)
docker compose -f docker-compose.dev.yml up -d
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set NEXTAUTH_SECRET
```

### 3. Create tables

```bash
npm run db:migrate:deploy
```

### 4. Start the dev server

```bash
npm run dev
```

### 5. Open the app

Visit [http://localhost:3000](http://localhost:3000). You will be redirected to `/setup` to create the first admin account.

---

## Production Deployment with Docker

### 1. Configure `.env`

```bash
cp .env.example .env
```

Set **all** of these:

| Variable | Description |
|---|---|
| `DB_HOST` | MySQL hostname (`db` when using docker-compose) |
| `DB_PORT` | MySQL port (default: `3306`) |
| `DB_NAME` | Database name (default: `samdb`) |
| `DB_USER` | Database username (default: `sam`) |
| `DB_PASSWORD` | Database password |
| `DB_SSL` | `true` to require TLS, `false` to disable (default) |
| `NEXTAUTH_SECRET` | Long random string — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of the app, e.g. `https://sam.example.com` |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (db container only) |

### 2. Build and start

```bash
docker compose up -d --build
```

### 3. Create tables (first time only)

```bash
docker compose exec app npx prisma migrate deploy
```

### 4. Open the app

Visit the URL you set in `NEXTAUTH_URL`. The setup wizard will appear on first run.

---

## Microsoft Entra ID SSO Setup

SSO is **optional**. When the three `AUTH_MICROSOFT_ENTRA_ID_*` variables are set, a "Sign in with Microsoft" button appears on the login page. Local credential login always remains available.

### Step 1 — Register the app in Azure

1. In the [Entra admin centre](https://entra.microsoft.com), go to **App registrations → New registration**
2. Name: `SAM – Simple Asset Management`
3. Supported account types: **Accounts in this organizational directory only** (single tenant)
4. **Platform**: choose **Web** (NOT SPA — this is critical)
5. Redirect URI: `https://<your-domain>/api/auth/callback/microsoft-entra-id`
   - For local dev also add: `http://localhost:3000/api/auth/callback/microsoft-entra-id`

### Step 2 — Get credentials

From the app registration overview page copy:
- **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
- **Directory (tenant) ID** → used to build the issuer URL

Under **Certificates & secrets → New client secret**:
- Copy the **Value** (not the Secret ID) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`

### Step 3 — Set environment variables

```bash
AUTH_MICROSOFT_ENTRA_ID_ID="<Application (client) ID>"
AUTH_MICROSOFT_ENTRA_ID_SECRET="<Client secret value>"
AUTH_MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0"
```

### Step 4 — Role assignment

SSO users are **auto-provisioned** on first login with the **Viewer** role. An Admin must then promote them in **Administration → Users**.

---

## User Roles

| Role | What they can do |
|---|---|
| **Admin** | Everything: manage users, settings, locations, assets, import |
| **Editor** | Create/edit/delete locations and assets, upload attachments, import CSV |
| **Viewer** | Read-only access to all data |

---

## Database Scripts

```bash
npm run db:migrate         # Create a migration from schema.prisma edits + apply it locally (dev)
npm run db:migrate:deploy  # Apply committed, pending migrations only (prod / first-time setup)
npm run db:push            # Push schema straight to DB, no migration file (prototyping only)
npm run db:generate        # Regenerate Prisma client after schema changes
npm run db:studio          # Open Prisma Studio (visual DB browser)
```

See `doc/sam/technical/database.md#database-scripts` for the full migration workflow, including how to safely add a required column to a table that already has rows.

---

## Prometheus & Grafana Integration

SAM exposes three endpoints that connect it to your monitoring stack. All are **optional** and only activate when `PROMETHEUS_SD_TOKEN` is set in your environment.

### Setup

Generate a token and add it to your `.env`:

```bash
openssl rand -base64 32
# → add result as PROMETHEUS_SD_TOKEN="..." in .env
```

---

### Scrape Target Templates (exporter-based monitoring)

Many AV devices cannot expose Prometheus metrics directly and are instead monitored via an **external exporter container** (e.g. the Pearl recorder exporter). The scrape template system lets you configure, per asset type, exactly how Prometheus should reach each device.

**Configure in:** Administration → Asset Types → expand a type → Edit template

**Template format:** One `key=value` pair per line. Keys are Prometheus `__labels__` that override scrape behaviour. Comments start with `#`.

**Available variables:**

| Variable | Replaced with |
|---|---|
| `{hostname_fqdn}` | Asset hostname (as stored in SAM) |
| `{serial}` | Asset serial number |
| `{model}` | Asset model |
| `{manufacturer}` | Manufacturer name |
| `{fi_number}` | Location FI number (e.g. `14.10.100.013`) |
| `{vault_path}` | The asset's Vault path — a **non-secret reference**, not the credential |

> Credentials are never rendered into a template. `{vault_path}` passes only the
> reference; the exporter reads the secret from Vault itself. There is no
> `{vault_<key>}` substitution — any such placeholder is passed through
> literally.

**Pearl recorder exporter example:**

```
__address__=https://pearlexporterdev.ugent.be
__metrics_path__=/probe
__param_target=https://{hostname_fqdn}
__param_vault_path={vault_path}
```

This results in Prometheus making a request to:
```
https://pearlexporterdev.ugent.be/probe?target=https%3A%2F%2Frectest001.ugent.be&vault_path=secret%2Fdata%2Fav%2Frectest001
```

**Prometheus config for exporter-based targets:**
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
      # Use the __address__ set by SAM's template (overrides the hostname)
      - source_labels: [__address__]
        target_label: __address__
```

> **Do not add a `regex: "sam_(.*)" / action: labelmap` rule.** Prometheus already
> attaches every non-`__` label from the SD target group to the scraped series, so
> the rule adds nothing. `labelmap` *copies* rather than renames, so it leaves each
> series carrying both `sam_model` and `model`, `sam_hostname` and `hostname`, etc.
> — doubled cardinality, and the unprefixed copies can collide with labels an
> exporter sets natively.

Assets of a type **without** a template continue to use their hostname directly as the scrape target (unchanged behaviour).

---

### HashiCorp Vault — per-device credentials

When a scrape template contains `{vault_path}`, SAM emits the asset's Vault path as a plain reference in the SD output. It never reads the secret itself, so credentials never appear in service discovery — the exporter resolves them from Vault at scrape time.

**Configuration:**
```bash
VAULT_ADDR="https://vault.example.com"   # Vault server URL
VAULT_TOKEN="s.xxxxxxxxxxxx"              # Static token with read access
VAULT_KV_VERSION="v2"                    # KV v1 or v2 (default: v2)
```

**Per-asset Vault path:** Set in the asset edit form → "Vault Credentials" section.
Example path: `secret/av/rectest001`

The Vault secret at that path should contain the keys referenced in the template:
```bash
# Write the secret (KV v2):
vault kv put secret/av/rectest001 username=admin password='%1ct04dm1n%'
```

**Test button:** In the asset form, click **Test** next to the Vault path field. SAM will verify connectivity and return the key names (never values) so you can confirm the path is correct without exposing credentials.

**Graceful degradation:** If Vault is unavailable or a path is missing, the asset still appears in the SD output with empty credential values and `sam_vault_missing="true"` label so you can alert on misconfigured devices.

---

### Endpoint 1 — HTTP Service Discovery (`/api/prometheus/sd`)

Returns every asset with a hostname as a Prometheus `http_sd_configs` target group, labelled with SAM metadata. Prometheus polls this endpoint and attaches the labels to **all metrics scraped from those hostnames**.

**Labels attached:**

| Label | Example | Description |
|---|---|---|
| `sam_hostname` | `projector-room101` | The asset hostname |
| `sam_fi_number` | `14.10.100.013` | Full FI number from the location |
| `sam_campus` | `14` | Campus code (CC) |
| `sam_building` | `10` | Building code (BB) |
| `sam_floor` | `100` | Floor code (FFF) |
| `sam_room` | `013` | Room code (RRR) |
| `sam_location_name` | `Room 013` | Human-readable room name |
| `sam_location_path` | `Campus A / Building 10 / Room 013` | Full path |
| `sam_asset_type` | `Projector` | Asset type |
| `sam_manufacturer` | `Epson` | Manufacturer |
| `sam_model` | `EB-W06` | Model |

**`prometheus.yml` configuration:**

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

No `relabel_configs` are needed to carry the SAM labels across: Prometheus
attaches every non-`__` label from the SD target group to the scraped series
automatically. Avoid a `regex: "sam_(.*)" / action: labelmap` rule — it *copies*
the labels rather than renaming them, leaving each series carrying both
`sam_model` and `model`, `sam_hostname` and `hostname`, and so on.

Every metric scraped from a known device carries labels like `sam_campus="14"`, `sam_asset_type="Projector"`, etc. — enabling PromQL queries like:

```promql
# All projectors in campus 14 that are unreachable
up{sam_campus="14", sam_asset_type="Projector"} == 0

# Average response time by building
avg by (sam_building) (probe_duration_seconds{sam_campus="14"})
```

---

### Endpoint 2 — Inventory metrics (`/api/prometheus/metrics`)

Exposes SAM inventory data in Prometheus text format — useful for tracking inventory trends in Grafana over time.

**`prometheus.yml` configuration:**

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

**Metrics exposed:**

| Metric | Type | Description |
|---|---|---|
| `sam_assets_total` | gauge | Total assets in SAM |
| `sam_locations_total` | gauge | Total locations |
| `sam_assets_without_hostname_total` | gauge | Assets with no hostname (monitoring gap) |
| `sam_assets_without_fi_number_total` | gauge | Assets in locations missing an FI number |
| `sam_assets_by_type{type="..."}` | gauge | Assets per asset type |
| `sam_assets_by_manufacturer{manufacturer="..."}` | gauge | Assets per manufacturer |
| `sam_assets_by_campus{campus="..."}` | gauge | Assets per campus code |
| `sam_locations_without_fi_number_total` | gauge | Locations with no FI number |
| `sam_asset_info{sam_hostname="...", ...}` | gauge | Always `1`. One series per asset expected to report, carrying its SAM metadata |
| `sam_asset_maintenance{sam_hostname="..."}` | gauge | Always `1`. Asset's room is in maintenance, so missing metrics are expected |
| `sam_asset_end_of_support_timestamp{sam_hostname="..."}` | gauge | End-of-support date as a Unix timestamp |

Plus the NIS2 compliance gauges — see [Integrations](doc/sam/technical/integrations.md).

`sam_asset_info` is the *expected set*: `up == 0` only covers targets service
discovery already advertises, so it can never surface an asset Prometheus has
never seen. Join against it to find what is missing:

```promql
sam_asset_info
  unless on (sam_hostname) (max by (sam_hostname) (probe_success) == 1)
  unless on (sam_hostname) sam_asset_maintenance
```

Always join on `sam_hostname` — each asset type is scraped through its own
exporter, so `instance` and `job` identify the exporter, not the device. The
`max by (sam_hostname)` collapses devices probed by more than one job.

---

### Endpoint 3 — Hostname lookup (`/api/assets/by-hostname`)

Returns full SAM metadata for a given hostname. Designed for use with the **Grafana Infinity datasource** plugin to build metadata lookup panels in your dashboards.

```
GET /api/assets/by-hostname?hostname=projector-room101
Authorization: Bearer <PROMETHEUS_SD_TOKEN>
```

**Response:**
```json
[
  {
    "hostname": "projector-room101",
    "model": "EB-W06",
    "serialNumber": "SN-12345",
    "type": { "name": "Projector" },
    "manufacturer": { "name": "Epson" },
    "macAddresses": ["AA:BB:CC:DD:EE:FF"],
    "installationDate": "2023-09-01",
    "location": {
      "name": "Room 013",
      "fiNumber": "14.10.100.013",
      "path": "Campus A / Building 10 / Floor 1 / Room 013",
      "campus": "14",
      "building": "10",
      "floor": "100",
      "room": "013"
    },
    "customFields": [{ "key": "GUID", "value": "abc-123" }]
  }
]
```

**Grafana Infinity datasource setup:**

1. Install plugin: `grafana-cli plugins install yesoreyeram-infinity-datasource`
2. Add a data source → type **Infinity**
3. Set Authentication: Custom HTTP Headers → `Authorization: Bearer <PROMETHEUS_SD_TOKEN>`
4. In a dashboard panel, use URL:
   ```
   https://sam.example.com/api/assets/by-hostname?hostname=${hostname_var}
   ```
   where `${hostname_var}` is a Grafana dashboard variable set from the selected host.

---

## Security Notes

- All HTTP responses include: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and (in production) `Strict-Transport-Security`
- File uploads: MIME type + extension allowlist, 50 MB cap, path traversal protection
- Passwords hashed with bcrypt (cost 13)
- JWT sessions expire after 8 hours
- Input validated with Zod on all API endpoints (string length caps, array size caps)
- SSO users cannot have a local password set

---

## Project Structure

Top-level directories are described in [doc/sam/technical/architecture.md](doc/sam/technical/architecture.md#project-structure); the per-module list lives in [AGENTS.md](AGENTS.md#project-architecture).

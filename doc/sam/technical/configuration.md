---
title: "Configuration"
sync_to_confluence: true
---

# Configuration

All configuration is done through environment variables. Copy `.env.example` to `.env` and edit.

`.env.example` is the authoritative reference — always update it when adding new variables.

---

## Required

These must be set for the application to start.

| Variable | Example | Description |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL hostname (`db` when using docker-compose) |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `samdb` | Database name |
| `DB_USER` | `sam` | Database username |
| `DB_PASSWORD` | `change-me` | Database password |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | JWT signing secret — generate a new one |
| `NEXTAUTH_URL` | `https://sam.example.com` | Full public URL, no trailing slash |

---

## Recommended for Production

| Variable | Default | Description |
|---|---|---|
| `DB_SSL` | `false` | Set `true` to require TLS (`sslaccept=strict`) for DB connections |

---

## File Uploads

| Variable | Default | Description |
|---|---|---|
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded files (local storage mode) |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |

### S3 Storage (when `STORAGE_DRIVER=s3`)

| Variable | Default | Description |
|---|---|---|
| `S3_BUCKET` | — | S3 bucket name |
| `S3_REGION` | `us-east-1` | AWS region |
| `S3_ENDPOINT` | — | Override endpoint for S3-compatible services (MinIO, R2, etc.) |
| `S3_FORCE_PATH_STYLE` | — | Set `true` for MinIO or Cloudflare R2 |
| `EXPORT_S3_PREFIX` | `backups/` | Key prefix for daily CSV backup uploads |

AWS credentials use the standard credential chain. Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` only if instance/pod credentials are unavailable.

---

## Microsoft Entra ID SSO

All three must be set to enable SSO. Leave blank to show local login only.

| Variable | Description |
|---|---|
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Client secret value |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |

See [Authentication](authentication.md) for Azure registration steps.

---

## Prometheus / Grafana Integration

| Variable | Description |
|---|---|
| `PROMETHEUS_SD_TOKEN` | Bearer token for `/api/prometheus/*` endpoints. Generate: `openssl rand -base64 32`. When blank, endpoints return 503. |
| `EXPORT_TOKEN` | Bearer token for `/api/export/csv` (allows cron-based exports without browser session) |

---

## HashiCorp Vault

Used by the Vault path *Test* button in the admin UI. SAM itself never resolves credentials for service discovery — a scrape template's `{vault_path}` emits only the reference, and the exporter reads the secret.

| Variable | Default | Description |
|---|---|---|
| `VAULT_ADDR` | — | Vault server URL, e.g. `https://vault.example.com` |
| `VAULT_KV_VERSION` | `v2` | KV secrets engine version: `v1` or `v2` |

**Authentication — choose one:**

**Token auth** (simpler, for static long-lived tokens):

| Variable | Description |
|---|---|
| `VAULT_TOKEN` | Static token with read access to all asset secret paths |

**AppRole auth** (recommended for production):

| Variable | Default | Description |
|---|---|---|
| `VAULT_ROLE_ID` | — | AppRole `role_id` |
| `VAULT_SECRET_ID` | — | AppRole `secret_id` |
| `VAULT_APPROLE_MOUNT` | `approle` | Auth mount path |

When both `VAULT_TOKEN` and AppRole vars are set, AppRole takes precedence.

---

## Audit Log → Syslog Forwarding

When `SYSLOG_HOST` is set, every `AuditLog` write is also forwarded to an rsyslog server via RFC 5424. Failed forwards are retried by `scripts/forward-audit.mjs` (run via cron).

| Variable | Default | Description |
|---|---|---|
| `SYSLOG_HOST` | — | rsyslog hostname — unset to disable |
| `SYSLOG_PORT` | `514` | Port (default 6514 for TLS) |
| `SYSLOG_TRANSPORT` | `udp` | `udp`, `tcp`, or `tls` |
| `SYSLOG_APP_NAME` | `sam` | APP-NAME field in RFC 5424 |
| `SYSLOG_HOSTNAME` | OS hostname | HOSTNAME field |
| `SYSLOG_FACILITY` | `10` | Syslog facility (10 = security/auth; 16–23 = local0–local7) |
| `SYSLOG_TIMEOUT_MS` | `3000` | Connect/send timeout in milliseconds |
| `SYSLOG_CA_BUNDLE` | — | TLS only — path to CA bundle PEM |
| `SYSLOG_TLS_REJECT_UNAUTHORIZED` | `true` | TLS only — set `false` for self-signed certs (dev) |

---

## App Settings (database, not environment)

These live in the `app_settings` table and are managed from **Administration → Settings** (security & compliance card):

| Key | Default | Description |
|---|---|---|
| `security.requireTwoFactor` | `false` | When `true`, every local (credentials) user without TOTP is forced into 2FA setup at next login. SSO users are unaffected (enforce MFA via Entra ID conditional access) |
| `audit.retentionDays` | `730` | Audit log retention consumed by `scripts/purge-audit.mjs` (30–3650 days) |
| `assets.defaultOwnerId` | — | User (e.g. a team account) assigned as owner to newly created assets when no owner is chosen |
| `compliance.reviewWorkLogItemId` | — | The fixed work-log item that marks a location's asset list as reviewed (feeds the compliance dashboard) |
| `compliance.reviewPeriodMonths` | `12` | Window within which the review item must be present per location |
| `hostname.urlTemplate` / `macAddress.urlTemplate` / `location.urlTemplate` | — | Turn a value into a link to an external system; point them at Grafana to reach the dashboards from SAM |

---

## JIRA Integration

Read-only. When all three are set, work-log entries with a JIRA key (e.g. `AVT-123`) display the issue summary and status.

| Variable | Description |
|---|---|
| `JIRA_BASE_URL` | JIRA instance URL, e.g. `https://yourorg.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email |
| `JIRA_API_TOKEN` | API token from [Atlassian account settings](https://id.atlassian.com/manage-profile/security/api-tokens) |

---

## Docker Compose

| Variable | Default | Description |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | — | MySQL root password (db container only, not the app) |
| `APP_PORT` | `3000` | Host port the app container is exposed on |
| `DB_PORT` | `3306` | Host port the DB container is exposed on (remove in prod) |

---

## Security Notes

- Never log or return `PROMETHEUS_SD_TOKEN`, `VAULT_TOKEN`, `VAULT_SECRET_ID`, or AppRole-derived tokens
- Never commit `.env` to version control — it is gitignored
- All secrets must come from environment variables — never hardcode in source
- `NEXTAUTH_SECRET` must be unique per deployment — generate with `openssl rand -base64 32`

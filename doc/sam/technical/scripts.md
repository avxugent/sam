---
title: "Maintenance Scripts"
sync_to_confluence: true
---

# Maintenance Scripts

SAM ships a set of standalone Node.js scripts for administrative and maintenance tasks. They live in the `scripts/` directory and run directly against the database (bypassing the HTTP API), so they must be executed from the project root where the `.env` file is located.

**Prerequisites:** Node 24 (`nvm use`), `.env` present and configured, `npm install` already run.

---

## Running a script

```bash
# from the project root
node --import tsx/esm scripts/<script-name>.mjs [flags]

# or via the npm shorthand (where one is defined)
npm run <script-name>
```

The scripts import the application's own TypeScript code from `lib/` (database client, settings, CSV export, syslog forwarding, MAC normalisation), so `--import tsx/esm` is required; the npm shorthands pass it. In the production image the scripts carry their own dependencies (`scripts/package.json`) and a copy of `lib/`; run them from `/app` the same way (`cd /app && node --import tsx/esm scripts/<script-name>.mjs`).

All scripts accept `--dry-run` to preview changes without writing anything.

---

## Scripts

### `clear-import-data.mjs`

**npm alias:** `npm run db:clear-import`

Wipes all locations and assets (including their attachments, MAC addresses, and custom fields) so a fresh CSV import can be run on a clean slate. Users, asset types, and manufacturers are preserved.

```bash
node --import tsx/esm scripts/clear-import-data.mjs           # asks for confirmation
node --import tsx/esm scripts/clear-import-data.mjs --force   # skip confirmation
```

| Flag | Description |
|---|---|
| `--force` | Skip the interactive confirmation prompt |

> **Warning:** This is irreversible. Ensure a backup exists before running.

---

### `add-location-links.mjs`

**npm alias:** `npm run locations:add-links`

Creates a link attachment on every location that has a FI number, pointing to the UGent lokalen portal (`https://lokalen.ugent.be/lokaal/{fiNumber}`). Idempotent — skips locations that already have the link unless `--force` is passed.

```bash
node --import tsx/esm scripts/add-location-links.mjs
node --import tsx/esm scripts/add-location-links.mjs --dry-run
node --import tsx/esm scripts/add-location-links.mjs --location-id <id>
node --import tsx/esm scripts/add-location-links.mjs --force
```

| Flag | Description |
|---|---|
| `--dry-run` | Preview without writing |
| `--location-id <id>` | Process a single location |
| `--base-url <template>` | URL template with `{fiNumber}` placeholder (default: lokalen.ugent.be) |
| `--label <text>` | Link label shown in the UI (default: `Lokalen UGent`) |
| `--force` | Overwrite existing links |
| `--user-id <id>` | Owner of the created attachment (default: first ADMIN user) |

---

### `resolve-ip-hostnames.mjs`

**npm alias:** `npm run assets:resolve-hostnames` (dry-run: `npm run assets:resolve-hostnames:dry-run`)

One-off migration helper. Older imports left bare IP addresses in the `Asset.hostname` field. This script finds every asset whose hostname is an IPv4/IPv6 address, performs a reverse-DNS (PTR) lookup, and rewrites the hostname to the resolved FQDN (lowercased, trailing dot stripped). Assets whose IP has no PTR record — or whose PTR resolves back to an IP — are left untouched and reported as unresolved. DNS failures never abort the run.

```bash
node --import tsx/esm scripts/resolve-ip-hostnames.mjs
node --import tsx/esm scripts/resolve-ip-hostnames.mjs --dry-run
node --import tsx/esm scripts/resolve-ip-hostnames.mjs --asset-id <id>
node --import tsx/esm scripts/resolve-ip-hostnames.mjs --dns-server 10.0.0.1,10.0.0.2
node --import tsx/esm scripts/resolve-ip-hostnames.mjs --timeout 8000
```

| Flag | Description |
|---|---|
| `--dry-run` | Preview without writing |
| `--asset-id <id>` | Process a single asset |
| `--dns-server <ips>` | Override resolver(s), comma-separated (default: system resolvers) |
| `--timeout <ms>` | Per-lookup timeout (default: `5000`) |

---

### `fix-scientific-notation-serials.mjs`

**npm alias:** `npm run assets:fix-serial-numbers` (dry-run: `npm run assets:fix-serial-numbers:dry-run`)

One-off cleanup. Legacy Excel exports sometimes wrote large serial numbers in scientific notation (e.g. `1,50304E+13`) before the CSV was imported, so the mangled text ended up stored verbatim in `Asset.serialNumber`. The mantissa only carries a handful of significant digits, so the original value can't be reconstructed — this script clears `serialNumber` on every affected asset and preserves the original (unreliable) text in a `"Legacy serial (unverified)"` custom field for manual follow-up against the physical device.

```bash
node --import tsx/esm scripts/fix-scientific-notation-serials.mjs
node --import tsx/esm scripts/fix-scientific-notation-serials.mjs --dry-run
```

| Flag | Description |
|---|---|
| `--dry-run` | Preview without writing |

---

### `fix-mac-address-format.mjs`

**npm alias:** `npm run assets:fix-mac-format` (dry-run: `npm run assets:fix-mac-format:dry-run`)

One-off cleanup. Legacy imports left `MacAddress.address` in a mix of formats (no separator, hyphen-separated, lowercase, Cisco dot-grouped). This script normalizes every address to `AA:BB:CC:DD:EE:FF` using the same rule as the CSV import (see [Import & Export](../user-guide/import-export.md)). Addresses that don't reduce to exactly 12 hex digits (typo'd character, missing digits) are left untouched and printed for manual review.

```bash
node --import tsx/esm scripts/fix-mac-address-format.mjs
node --import tsx/esm scripts/fix-mac-address-format.mjs --dry-run
```

| Flag | Description |
|---|---|
| `--dry-run` | Preview without writing |

---

### `migrate-quantity-custom-field.mjs`

**npm alias:** `npm run assets:migrate-quantity` (dry-run: `npm run assets:migrate-quantity:dry-run`)

One-off migration. Before `Asset.quantity` existed, the CSV import wrote the legacy `QUANTITY` column into a free-text `"Quantity"` custom field, which nothing counted. This script moves that value onto the real `Asset.quantity` column and deletes the custom field row. An asset with a serial number, hostname, or MAC address is left at quantity 1 and flagged for manual review instead of being changed (an individually-identified item can't have a bulk quantity), as is any value that isn't a positive integer. The script is idempotent — deleting the custom field as it goes means a second run finds nothing left to do.

```bash
node --import tsx/esm scripts/migrate-quantity-custom-field.mjs
node --import tsx/esm scripts/migrate-quantity-custom-field.mjs --dry-run
```

| Flag | Description |
|---|---|
| `--dry-run` | Preview without writing |

---

### `sync-lokalen.mjs`

**npm alias:** `npm run locations:sync-lokalen`

Crawls `https://lokalen.ugent.be/lokaal/{fiNumber}` for every location that has a FI number and syncs three things back into SAM:

1. **Name** — updates the location name if it differs from the portal (the portal name includes building and campus context, e.g. `Auditorium 1 Marc Maes, Lichamelijke Opvoeding, Campus Dunant`).
2. **Address** — sets or updates the street address from the portal.
3. **Photos** — downloads all photos from the portal, stores them as file attachments, and sets the first photo as the cover image if none is configured.

The script handles the Apache Wicket session cookie required by the portal automatically. Re-running is safe: photos are skipped if their source URL is already recorded in the database.

```bash
node --import tsx/esm scripts/sync-lokalen.mjs                           # sync all locations
node --import tsx/esm scripts/sync-lokalen.mjs --dry-run                 # preview changes
node --import tsx/esm scripts/sync-lokalen.mjs --fi-number 14.10.100.013 # single location
node --import tsx/esm scripts/sync-lokalen.mjs --skip-images             # metadata only, no photo download
node --import tsx/esm scripts/sync-lokalen.mjs --force                   # re-download photos even if already present
node --import tsx/esm scripts/sync-lokalen.mjs --debug                   # dump raw HTML and selector matches
```

| Flag | Description |
|---|---|
| `--dry-run` | Preview without writing |
| `--fi-number <fi>` | Process a single location by FI number |
| `--skip-images` | Sync name and address only, skip photo download |
| `--force` | Re-download photos even if already stored |
| `--user-id <id>` | Owner of uploaded attachments (default: first ADMIN user) |
| `--debug` | Print raw HTML and extracted field values for selector inspection |

**Storage:** Photos are stored using the same storage backend (local or S3) configured in `.env`. Ensure `UPLOAD_DIR` (local) or `S3_BUCKET` / `S3_ENDPOINT` (S3) are correctly configured before running. `S3_ENDPOINT` must be a full URL including protocol (e.g. `https://minio.example.com`).

---

### `add-attachment.mjs`

**npm alias:** `npm run attachment:add`

Adds a link attachment (URL + label) to a single location or asset. Useful for bulk-linking external resources via a shell loop.

```bash
node --import tsx/esm scripts/add-attachment.mjs --location-id <id> --url <url> --label <label>
node --import tsx/esm scripts/add-attachment.mjs --asset-id <id>    --url <url> --label <label>
```

| Flag | Description |
|---|---|
| `--location-id <id>` | Target location (mutually exclusive with `--asset-id`) |
| `--asset-id <id>` | Target asset (mutually exclusive with `--location-id`) |
| `--url <url>` | Link URL (required) |
| `--label <text>` | Display label shown in the UI (required) |
| `--user-id <id>` | Owner of the attachment (default: first ADMIN user) |
| `--dry-run` | Preview without writing |

---

### `export-backup.mjs`

**npm alias:** `npm run export:backup`

Writes the import-compatible CSV export (`sam-export-<date>.csv`, the same file as `GET /api/export/csv`: installed assets plus empty locations), the JSON inventory snapshot (`sam-inventory-<date>.json`, the same as `GET /api/export/snapshot`: every asset in any status, suppliers and locations), and a `sam-manifest-<date>.json` containing the SHA-256 hash and byte size of both files (tamper-evident NIS2 evidence — verify with `shasum -a 256`). Saves to disk or uploads all three to S3. Designed for use in automated backup pipelines or cron jobs.

```bash
node --import tsx/esm scripts/export-backup.mjs                          # write to configured destination
node --import tsx/esm scripts/export-backup.mjs --output /path/to/dir   # force local disk at given path
node --import tsx/esm scripts/export-backup.mjs --dry-run               # count rows only, no file written
```

Destination resolution order:
1. `--output` flag → local disk at specified directory.
2. `STORAGE_DRIVER=s3` → uploads to `s3://$S3_BUCKET/$EXPORT_S3_PREFIX/<timestamp>.csv`.
3. Default → local disk at the `export.outputDir` setting (Admin → Export; default `/backups`).

| Flag | Description |
|---|---|
| `--output <dir>` | Write to local directory (overrides S3) |
| `--dry-run` | Report row count without writing |

---

### `forward-audit.mjs`

Forwards undelivered audit log entries to a configured rsyslog server over UDP, TCP, or TLS (RFC 5424 format). Intended to run as a cron job (e.g. every minute) to keep delivery lag short.

```bash
node --import tsx/esm scripts/forward-audit.mjs               # forward all pending rows
node --import tsx/esm scripts/forward-audit.mjs --batch 500   # limit to 500 rows per run
node --import tsx/esm scripts/forward-audit.mjs --dry-run     # report what would be sent
```

| Flag | Description |
|---|---|
| `--batch <n>` | Maximum rows to forward per run (default: 1000) |
| `--dry-run` | Report pending rows without sending |

Requires `SYSLOG_HOST` (and related `SYSLOG_*` variables) to be set in `.env`. See [Configuration](configuration.md) for the full variable reference.

---

### `purge-audit.mjs`

Deletes audit log rows older than the configured retention period (the `audit.retentionDays` app setting, default 730 days). Intended to run as a daily cron job (e.g. `0 3 * * *`). This script is the **only** deletion path for audit entries — there is deliberately no API endpoint.

```bash
node --import tsx/esm scripts/purge-audit.mjs                # purge expired rows
node --import tsx/esm scripts/purge-audit.mjs --batch 5000   # limit to 5000 rows per run
node --import tsx/esm scripts/purge-audit.mjs --dry-run      # report what would be deleted
```

| Flag | Description |
|---|---|
| `--batch <n>` | Maximum rows to delete per run (default: 10000) |
| `--dry-run` | Report purgeable rows without deleting |

**Safety rule:** while syslog forwarding is configured (`SYSLOG_HOST` set), rows that were never forwarded (`forwardedAt IS NULL`) are never purged, regardless of age — run `forward-audit.mjs` first. The script warns about such retained rows.

---

## Common patterns

**Process all locations, preview first:**
```bash
node --import tsx/esm scripts/sync-lokalen.mjs --dry-run
node --import tsx/esm scripts/sync-lokalen.mjs
```

**Reset and re-import from CSV:**
```bash
node --import tsx/esm scripts/clear-import-data.mjs --force
# then use the Import page in the UI
```

**Bulk-add portal links after initial import:**
```bash
node --import tsx/esm scripts/add-location-links.mjs --dry-run
node --import tsx/esm scripts/add-location-links.mjs
```

**Schedule nightly backup (crontab):**
```
0 2 * * * cd /opt/sam && node --import tsx/esm scripts/export-backup.mjs >> /var/log/sam-backup.log 2>&1
```

**Schedule audit forwarding (crontab):**
```
* * * * * cd /opt/sam && node --import tsx/esm scripts/forward-audit.mjs >> /var/log/sam-audit.log 2>&1
```

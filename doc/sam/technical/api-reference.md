---
title: "API Reference"
sync_to_confluence: true
---

# API Reference

All API routes return `NextResponse.json(...)`. Auth and role checks happen inside every handler.

## Error responses

| Status | Meaning |
|---|---|
| 400 | Validation error — body contains `{ error: string, details?: … }` |
| 401 | Unauthenticated — no valid session or Bearer token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 409 | Conflict — unique constraint violation (e.g., duplicate `fiNumber`) |
| 500 | Internal server error |

---

## Assets

| Method | Path | Min role | Description |
|---|---|---|---|
| `POST` | `/api/assets` | EDITOR | Create asset |
| `GET` | `/api/assets/[id]` | VIEWER | Get asset detail |
| `PUT` | `/api/assets/[id]` | EDITOR | Update asset |
| `DELETE` | `/api/assets/[id]` | EDITOR | Delete asset |
| `POST` | `/api/assets/[id]/decommission` | EDITOR | Mark asset decommissioned. Body: `{ disposalMethod: WIPED\|DESTROYED\|RETURNED\|RESOLD\|OTHER (required), note? }`. Also records who decommissioned it. Allowed from INSTALLED or IN_REPAIR; clears any repair fields |
| `POST` | `/api/assets/[id]/reinstate` | ADMIN | Restore a decommissioned asset to INSTALLED |
| `POST` | `/api/assets/[id]/return-to-stock` | EDITOR | Move asset back to stock. Body: `{ locationId (required, must reference an existing location) }`. Allowed from INSTALLED or IN_REPAIR |
| `POST` | `/api/assets/[id]/send-for-repair` | EDITOR | Mark an INSTALLED asset IN_REPAIR. Body: `{ note? }`. Records who sent it and when (`repairStartedAt`). There is no "return from repair" endpoint — an IN_REPAIR asset exits via return-to-stock, decommission, or delete |
| `GET` | `/api/assets/[id]/history` | VIEWER | Full audit trail for this asset's `lineageId`, across Asset ↔ StockItem conversions — see [Database → Asset history](database.md#asset-history) |
| `GET` | `/api/assets/by-hostname` | Bearer token | Grafana Infinity datasource lookup |

### Asset body (create/update)

Key validated fields:
- `locationId` — required
- `hostname` — when set, at least one MAC address is required. Must match the asset's type's `hostnamePattern` if one is configured, otherwise a generic FQDN check applies. Globally unique across all assets (including decommissioned ones) — a duplicate returns `409`
- `macAddresses` — array of MAC address strings
- `customFields` — array of `{ key, value }` objects
- `installationDate` — ISO date string
- `ownerId` — soft user reference. When absent on create, the `assets.defaultOwnerId` setting is applied; explicit `null` stays empty
- `criticality` — `LOW | MEDIUM | HIGH | CRITICAL` or `null` (inherit the type's `defaultCriticality`)
- `endOfSupportDate` — ISO date string
- `supplierId` — must reference an existing supplier (`400` otherwise). When absent on create, the supplier whose default window contains today is applied; explicit `null` stays empty

---

## Locations

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/locations` | VIEWER | List all locations (tree structure) |
| `POST` | `/api/locations` | EDITOR | Create location |
| `GET` | `/api/locations/[id]` | VIEWER | Get location with ancestor path |
| `PUT` | `/api/locations/[id]` | EDITOR | Update location (returns `409 LOCATION_NAME_EXISTS` with `targetId` when the new name collides with a sibling). Accepts `inMaintenance` (boolean) — allowed only on rooms (leaf locations); setting it `true` on a location with sub-locations returns `400` |
| `POST` | `/api/locations/[id]/merge` | EDITOR | Merge this location into a sibling (`targetId`): moves its assets, sub-locations, attachments and work logs to the target, then deletes it |
| `DELETE` | `/api/locations/[id]` | EDITOR | Delete location and its assets. Blocked with `400 HAS_SUBLOCATIONS` if children exist, unless `?cascade=true` is passed — then the whole sub-tree is deleted. Also blocked with `400 HAS_STOCK` if the location (or, when cascading, any descendant) still holds stock |
| `GET` | `/api/locations/[id]/assets` | VIEWER | Assets in location |
| `GET` | `/api/locations/[id]/attachments` | VIEWER | Location attachments |
| `POST` | `/api/locations/[id]/work-logs` | EDITOR | Create work log for location |

---

## Asset Types

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/asset-types` | VIEWER | List all |
| `POST` | `/api/asset-types` | ADMIN | Create |
| `GET` | `/api/asset-types/[id]` | VIEWER | Get detail |
| `PUT` | `/api/asset-types/[id]` | ADMIN | Update (including scrape template, `hostnamePattern`, and `defaultCriticality`) |
| `DELETE` | `/api/asset-types/[id]` | ADMIN | Delete |
| `GET` | `/api/asset-types/[id]/assets` | VIEWER | Active assets of this type. `?status=DECOMMISSIONED` lists decommissioned only; `?status=all` lists both |
| `POST` | `/api/asset-types/[id]/presets` | ADMIN | Create maintenance preset |
| `GET` | `/api/asset-types/presets/[id]` | VIEWER | Get preset |
| `PUT` | `/api/asset-types/presets/[id]` | ADMIN | Update preset |
| `GET` | `/api/asset-types/[id]/manufacturer-templates` | VIEWER | List brand-specific scrape template overrides for this type |
| `POST` | `/api/asset-types/[id]/manufacturer-templates` | ADMIN | Create a brand-specific scrape template override |
| `PUT` | `/api/asset-types/manufacturer-templates/[id]` | ADMIN | Update a brand-specific scrape template override |
| `DELETE` | `/api/asset-types/manufacturer-templates/[id]` | ADMIN | Delete a brand-specific scrape template override |

---

## Manufacturers

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/manufacturers` | VIEWER | List all |
| `POST` | `/api/manufacturers` | ADMIN | Create |
| `GET` | `/api/manufacturers/[id]` | VIEWER | Get detail |
| `PUT` | `/api/manufacturers/[id]` | ADMIN | Update |
| `DELETE` | `/api/manufacturers/[id]` | ADMIN | Delete |
| `GET` | `/api/manufacturers/[id]/assets` | VIEWER | Assets by manufacturer |
| `POST` | `/api/manufacturers/[id]/merge` | ADMIN | Merge into another manufacturer |

---

## Suppliers

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/suppliers` | VIEWER | List all (with asset counts) |
| `POST` | `/api/suppliers` | ADMIN | Create. Body: `{ name, contractReference?, contactInfo?, defaultFrom?, defaultUntil? }`. Overlapping default windows across suppliers return `400 supplierWindowOverlap`; duplicate name returns `409` |
| `PUT` | `/api/suppliers/[id]` | ADMIN | Update (same body/validation as create) |
| `DELETE` | `/api/suppliers/[id]` | ADMIN | Delete — blocked with `400` while assets reference the supplier |

The **default window** (`defaultFrom` → `defaultUntil`, `defaultUntil` empty = open-ended) auto-assigns the supplier to assets created within the window without an explicit supplier (manual create, CSV import, stock deploy).

---

## Attachments

| Method | Path | Min role | Description |
|---|---|---|---|
| `POST` | `/api/attachments` | EDITOR | Upload file or create link |
| `GET` | `/api/attachments/[id]` | VIEWER | Download file |
| `PUT` | `/api/attachments/[id]` | EDITOR | Edit display name, description, or URL |
| `DELETE` | `/api/attachments/[id]` | EDITOR | Delete attachment |

Upload request: `multipart/form-data` with `file` field. Max size: 50 MB.

---

## Stock

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/stock` | VIEWER | List stock items |
| `POST` | `/api/stock` | EDITOR | Create stock item |
| `GET` | `/api/stock/[id]` | VIEWER | Get stock item detail |
| `PUT` | `/api/stock/[id]` | EDITOR | Update stock item |
| `DELETE` | `/api/stock/[id]` | EDITOR | Delete stock item |
| `POST` | `/api/stock/[id]/deploy` | EDITOR | Deploy stock item as asset at a location |

Deploy body: `{ locationId: string }`. Carries metadata (MAC, hostname, custom fields) from the stock item to the new asset. Returns `409` if the carried-over hostname is already assigned to another asset.

`GET /api/stock` accepts an optional `?locationId=` filter for the storage location. Create/update bodies accept an optional `locationId` — the physical storage location (a `Location`, same tree used for assets), distinct from `reservedForLocationId`.

---

## Users

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/users` | EDITOR | List users |
| `POST` | `/api/users` | ADMIN | Create user |
| `GET` | `/api/users/[id]` | EDITOR | Get user |
| `PUT` | `/api/users/[id]` | ADMIN | Update user (rejects password change for SSO accounts) |
| `DELETE` | `/api/users/[id]` | ADMIN | Delete user |
| `GET` | `/api/users/me` | VIEWER | Current user's profile |
| `GET` | `/api/users/lite` | EDITOR | Minimal `{id, name}` list (asset form owner dropdown) |
| `GET` | `/api/users/export` | ADMIN | Access-review CSV (name, email, role, provider, 2FA status, last login). Session only — no token access |

---

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST/GET` | `/api/auth/[...nextauth]` | public | NextAuth handler |
| `POST` | `/api/auth/2fa/setup` | session | Generate TOTP secret + QR code |
| `POST` | `/api/auth/2fa/enable` | session | Verify first code and enable 2FA |
| `POST` | `/api/auth/2fa/disable` | session | Disable 2FA |
| `GET` | `/api/auth/2fa/status` | session | Check 2FA status |
| `POST` | `/api/auth/2fa/verify` | session | Verify TOTP code during login |
| `POST` | `/api/auth/passkey/registration-options` | session | Generate WebAuthn registration options |
| `POST` | `/api/auth/passkey/registration-verify` | session | Verify registration response, persist the passkey |
| `POST` | `/api/auth/passkey/authentication-options` | session (pending 2FA) | Generate WebAuthn authentication options during login |
| `POST` | `/api/auth/passkey/authentication-verify` | session (pending 2FA) | Verify passkey assertion during login |
| `GET` | `/api/auth/passkey/list` | session | List the current user's passkeys |
| `DELETE` | `/api/auth/passkey/[id]` | session | Remove one of the current user's passkeys |

---

## Work Logs

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/work-logs` | VIEWER | List work logs (with optional JIRA summaries) |
| `POST` | `/api/work-logs` | EDITOR | Create work log |
| `GET` | `/api/work-logs/[id]` | VIEWER | Get work log |
| `PUT` | `/api/work-logs/[id]` | EDITOR | Update work log |
| `DELETE` | `/api/work-logs/[id]` | EDITOR | Delete work log |

### Work log items (fixed)

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/work-log-items` | VIEWER | List fixed work log items |
| `POST` | `/api/work-log-items` | ADMIN | Create a fixed work log item (409 on duplicate name) |
| `PUT` | `/api/work-log-items/[id]` | ADMIN | Update a fixed work log item |
| `DELETE` | `/api/work-log-items/[id]` | ADMIN | Delete a fixed work log item (clears it from referencing work logs) |

---

## Import / Export

| Method | Path | Min role | Description |
|---|---|---|---|
| `POST` | `/api/import` | EDITOR | Bulk CSV import (creates assets, validates per row) |
| `GET` | `/api/export/csv` | ADMIN or Bearer `EXPORT_TOKEN` | Download active-asset CSV export (status `INSTALLED` only) |
| `GET` | `/api/export/decommissioned` | ADMIN | Download decommissioned-asset CSV (adds decommission metadata columns) |
| `GET` | `/api/export/stock` | ADMIN | Download current stock inventory CSV |
| `GET` | `/api/export/snapshot` | session or Bearer `EXPORT_TOKEN` | Point-in-time JSON inventory snapshot (assets incl. owner/criticality/end-of-support/supplier/disposal, suppliers, locations) — NIS2 evidence artifact |
| `POST` | `/api/settings/export` | ADMIN | Trigger backup script |

---

## Compliance

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/compliance/hostname/export` | ADMIN | Download CSV of all hostnames that do not match their asset type's pattern (or the FQDN fallback). The report itself is viewed at **Administration → Compliance**. |

---

## Settings

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET/PUT` | `/api/settings/compliance` | ADMIN | Security & compliance settings: `requireTwoFactor`, `auditRetentionDays` (30–3650), `defaultOwnerId`, `reviewWorkLogItemId`, `reviewPeriodMonths` (1–120) |

---

## Audit Log

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/audit-logs` | ADMIN | List audit log entries (filterable by entity, user, date) |

Actions recorded: `CREATE`, `UPDATE`, `DELETE`, `IMPORT`, `EXPORT`, plus authentication events `LOGIN_SUCCESS`, `LOGIN_FAILED` (with reason: rate_limited / unknown_user / sso_only / invalid_password / TOTP failures), and `LOGOUT`. There is deliberately no delete endpoint — retention is enforced only by `scripts/purge-audit.mjs`.

---

## Search

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/search?q=…` | VIEWER | Full-text search across assets and locations |

---

## Reports

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/reports` | VIEWER | List reports |
| `POST` | `/api/reports` | EDITOR | Create report |
| `GET` | `/api/reports/[id]` | VIEWER | Get report |
| `PUT` | `/api/reports/[id]` | EDITOR | Update report |
| `DELETE` | `/api/reports/[id]` | EDITOR | Delete report |
| `POST` | `/api/reports/[id]/run` | VIEWER | Execute report query |
| `GET` | `/api/reports/[id]/export` | VIEWER | Export report results as CSV |

---

## Prometheus

All endpoints use Bearer token authentication (`Authorization: Bearer <PROMETHEUS_SD_TOKEN>`). Return 503 when `PROMETHEUS_SD_TOKEN` is not configured.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/prometheus/sd` | HTTP Service Discovery — returns target groups with `sam_*` labels |
| `GET` | `/api/prometheus/metrics` | Prometheus text format inventory metrics |

---

## Grafana

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/grafana` | session | Index endpoint |
| `GET` | `/api/grafana/search` | session | Field search |
| `GET` | `/api/grafana/query` | session | Query execution |
| `GET` | `/api/grafana/tag-keys` | session | Tag autocomplete |
| `GET` | `/api/grafana/tag-values` | session | Tag value lookup |

---

## Settings

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/settings/general` | VIEWER | Get application settings |
| `PUT` | `/api/settings/general` | ADMIN | Update application settings |

---

## Miscellaneous

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/setup` | public | Check if setup is needed (returns `userCount`) |
| `POST` | `/api/setup` | public | Create first admin (only when `userCount === 0`) |
| `GET` | `/api/models` | VIEWER | List unique model strings across assets and stock items (for the model combobox), deduplicated case-insensitively, sorted alphabetically, max 20. Accepts `q`, `typeId`, `manufacturerId` filters |
| `GET` | `/api/models/similar` | VIEWER | Fuzzy-match a candidate model name (`q`) against existing ones; returns `{ match: { model, distance } \| null }`. Used to show a "did you mean an existing model?" warning while editing an asset |
| `GET` | `/api/jira/issue/[key]` | VIEWER | Fetch JIRA issue summary and status |
| `GET` | `/api/vault/test` | EDITOR | Test Vault connection for an asset's vault path |

---

## Model Cleanup

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/models/clusters` | ADMIN | List clusters of 2+ similar-but-not-identical model spellings, grouped by fuzzy edit-distance matching |
| `POST` | `/api/models/merge` | ADMIN | Rewrite all assets using any of `variants` to `canonical` (bulk rename, no entity to delete since `model` is a plain string field) |

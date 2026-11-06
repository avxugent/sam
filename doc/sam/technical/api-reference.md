---
title: "API Reference"
sync_to_confluence: true
---

# API Reference

All API routes return `NextResponse.json(...)`. Auth and role checks happen inside every handler.

## Error responses

| Status | Meaning |
|---|---|
| 400 | Validation error — body contains `{ error: string, details?: … }`. Zod failures (including a missing or malformed JSON body) return `{ error: "Invalid input", details: { formErrors, fieldErrors } }`; domain checks that list specific problems (scrape template syntax, hostname pattern, overlapping supplier windows) return `details` as a `string[]` meant for display |
| 401 | Unauthenticated — no valid session or Bearer token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 409 | Conflict — unique constraint violation (e.g., duplicate `fiNumber`, name or email) |
| 500 | Internal server error |

Successful `DELETE` requests return `200` with `{ ok: true }`.

---

## Assets

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/assets/[id]` | VIEWER | Get asset detail |
| `PUT` | `/api/assets/[id]` | EDITOR | Update asset |
| `DELETE` | `/api/assets/[id]` | EDITOR | Delete asset |
| `POST` | `/api/assets/[id]/decommission` | EDITOR | Mark asset decommissioned. Body: `{ disposalMethod: WIPED\|DESTROYED\|RETURNED\|RESOLD\|OTHER (required), note? }`. Also records who decommissioned it. Allowed from INSTALLED or IN_REPAIR; clears any repair fields |
| `POST` | `/api/assets/[id]/reinstate` | ADMIN | Restore a decommissioned asset to INSTALLED |
| `POST` | `/api/assets/[id]/return-to-stock` | EDITOR | Move asset back to stock. Body: `{ locationId (required, must reference an existing location) }`. Allowed from INSTALLED or IN_REPAIR |
| `POST` | `/api/assets/[id]/send-for-repair` | EDITOR | Mark an INSTALLED asset IN_REPAIR. Body: `{ note? }`. Records who sent it and when (`repairStartedAt`). There is no "return from repair" endpoint — an IN_REPAIR asset exits via return-to-stock, decommission, or delete |
| `GET` | `/api/assets/[id]/history` | VIEWER | Full audit trail for this asset's `lineageId`, across Asset ↔ StockItem conversions — see [Database → Asset history](database.md#asset-history) |
| `POST` | `/api/assets/bulk-decommission` | EDITOR | Decommission several assets. Body: `{ ids (1–200), disposalMethod, note? }` |
| `POST` | `/api/assets/bulk-return-to-stock` | EDITOR | Move several assets back to stock. Body: `{ ids (1–200), locationId }`; an unknown `locationId` returns `400` `code: "unknownReference"` |
| `GET` | `/api/assets/by-hostname` | VIEWER session or Bearer token | Grafana Infinity datasource lookup (`?hostname=`, 1–255 chars; otherwise `400` `Invalid input`). Matches active (INSTALLED) assets only — decommissioned assets are historical and excluded |

Assets are created under their location: `POST /api/locations/[id]/assets` (see [Locations](#locations)).

The bulk routes (`/api/assets/bulk-*`, `/api/stock/bulk-relocate`) report per id and return `200` with `{ succeeded: string[], failed: { id, reason }[] }`; `reason` is `NOT_FOUND`, a lifecycle rule code, or `STATUS_CHANGED`.

The lifecycle routes (decommission, reinstate, return-to-stock, send-for-repair and the bulk variants) only write while the asset still has the status they checked. If a concurrent request changed it first, the single-asset routes return `409` with `code: "statusChanged"` and the bulk routes report the id as failed with reason `STATUS_CHANGED`. `POST /api/stock/[id]/deploy` likewise only draws units while the stock item still holds the quantity it checked; otherwise it returns `409` with `code: "stockChanged"`.

### Asset body (create/update)

Create: `POST /api/locations/[id]/assets` (the location comes from the path). Update: `PUT /api/assets/[id]`.

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
| `PUT` | `/api/locations/[id]` | EDITOR | Update location (returns `409` with `code: "locationNameExists"`, `existingId` and `existingName` when the new name collides with a sibling, so the client can offer a merge). Accepts `inMaintenance` (boolean) — allowed only on rooms (leaf locations); setting it `true` on a location with sub-locations returns `400` |
| `POST` | `/api/locations/[id]/merge` | EDITOR | Merge this location into a sibling (`targetId`): moves its assets, stock items, sub-locations, attachments and work logs to the target, then deletes it |
| `DELETE` | `/api/locations/[id]` | EDITOR | Delete location and its assets. A location with sub-locations is **ADMIN** only (`403` for others): blocked with `400` `code: "hasSublocations"` unless `?cascade=true` is passed — then the whole sub-tree is deleted (the audit entry records how many locations and assets). Also blocked with `400` `code: "hasStock"` if the location (or, when cascading, any descendant) still holds stock |
| `GET` | `/api/locations/[id]/assets` | VIEWER | Assets in location. `?recursive=true` includes sub-locations; `?status=` as for the asset-type and manufacturer lists |
| `POST` | `/api/locations/[id]/assets` | EDITOR | Create asset in this location — see [Asset body](#asset-body-createupdate) |
| `GET` | `/api/locations/[id]/work-logs` | VIEWER | Work logs of this location, newest first |
| `POST` | `/api/locations/[id]/work-logs` | EDITOR | Create work log for location |

---

## Asset Types

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/asset-types` | VIEWER | List all |
| `POST` | `/api/asset-types` | ADMIN | Create; `409` on a duplicate name |
| `PUT` | `/api/asset-types/[id]` | ADMIN | Update (including scrape template, `hostnamePattern`, and `defaultCriticality`); renaming onto an existing name returns `409` with `code: "nameConflict"` and the existing type, so the client can offer a merge |
| `DELETE` | `/api/asset-types/[id]` | ADMIN | Delete |
| `POST` | `/api/asset-types/[id]/merge` | ADMIN | Merge into another asset type (`targetId`) — moves its assets, stock items and models (a model whose name already exists under the target is folded into it), drops its maintenance presets, then deletes it |
| `GET` | `/api/asset-types/[id]/assets` | VIEWER | Installed assets of this type. `?status=` takes `INSTALLED` (default), `IN_REPAIR`, `DECOMMISSIONED` or `all`; any other value is a `400` |
| `GET` | `/api/asset-types/[id]/presets` | VIEWER | List this type's maintenance presets |
| `POST` | `/api/asset-types/[id]/presets` | ADMIN | Create maintenance preset |
| `PUT` | `/api/asset-types/presets/[id]` | ADMIN | Update preset |
| `DELETE` | `/api/asset-types/presets/[id]` | ADMIN | Delete preset |
| `GET` | `/api/asset-types/[id]/manufacturer-templates` | VIEWER | List brand-specific scrape template overrides for this type |
| `POST` | `/api/asset-types/[id]/manufacturer-templates` | ADMIN | Create a brand-specific scrape template override |
| `PUT` | `/api/asset-types/manufacturer-templates/[id]` | ADMIN | Update a brand-specific scrape template override |
| `DELETE` | `/api/asset-types/manufacturer-templates/[id]` | ADMIN | Delete a brand-specific scrape template override |
| `GET` | `/api/asset-types/[id]/model-templates` | VIEWER | List model-specific scrape template overrides for this type |
| `POST` | `/api/asset-types/[id]/model-templates` | ADMIN | Create a model-specific scrape template override |
| `PUT` | `/api/asset-types/model-templates/[id]` | ADMIN | Update a model-specific scrape template override |
| `DELETE` | `/api/asset-types/model-templates/[id]` | ADMIN | Delete a model-specific scrape template override |

---

## Manufacturers

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/manufacturers` | VIEWER | List all. Accepts an optional `typeId` filter — when given, only manufacturers with at least one Model under that asset type are returned |
| `POST` | `/api/manufacturers` | MAINTAINER | Create; `409` on a duplicate name |
| `PUT` | `/api/manufacturers/[id]` | MAINTAINER | Update; renaming onto an existing name returns `409` with `code: "nameConflict"` and the existing manufacturer, so the client can offer a merge |
| `DELETE` | `/api/manufacturers/[id]` | MAINTAINER | Delete; `404` if unknown, `400` while assets or models reference it |
| `GET` | `/api/manufacturers/[id]/assets` | VIEWER | Installed assets by manufacturer. `?status=` as for the asset-type list |
| `POST` | `/api/manufacturers/[id]/merge` | MAINTAINER | Merge into another manufacturer — moves its assets, stock items and models (a model whose name already exists under the target is folded into it) |

---

## Models

Fixed lookup table for the Asset/StockItem "model" field, scoped by `(typeId, manufacturerId, name)`. Admin-managed — no inline creation from the asset/stock forms.

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/models` | VIEWER | List models. Accepts `q` (name contains), `typeId`, `manufacturerId` filters |
| `POST` | `/api/models` | MAINTAINER | Create. Body accepts an optional `documentationUrl` (must be a valid URL if present) — required for compliance, but not enforced here so a model can be added to unblock inventory entry before its documentation page exists |
| `PUT` | `/api/models/[id]` | MAINTAINER | Update (type/manufacturer/name/documentationUrl); `409` with `{ code: "nameConflict", existingId, existingName, existingAssetCount, existingStockCount }` on a name collision within the same type/manufacturer (the client offers a merge) |
| `DELETE` | `/api/models/[id]` | MAINTAINER | Delete; `400` if any asset or stock item still references it |
| `GET` | `/api/models/[id]/usage` | VIEWER | Active (INSTALLED) assets and stock items referencing this model — decommissioned assets are historical and excluded |
| `POST` | `/api/models/[id]/merge` | MAINTAINER | Merge into another model — reassigns **both** `Asset.modelId` and `StockItem.modelId` from the source to the target, then deletes the source. If the two models don't share the same `typeId`, every moved asset/stock item's own `typeId` is cascaded to the target's as part of the merge, so it never ends up pointing at a model from a different type than itself |

Every merge endpoint takes `{ targetId }` and returns `{ ok: true, assetsMoved, … }` with the counts that apply — `stockItemsMoved`, `modelsMoved`, `modelsFolded`, `sublocationsMoved` — and logs a `DELETE` audit entry on the source with the same counts.

---

## Suppliers

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/suppliers` | VIEWER | List all (with active/INSTALLED asset counts — decommissioned assets are historical and excluded) |
| `POST` | `/api/suppliers` | MAINTAINER | Create. Body: `{ name, contractReference?, contactInfo?, defaultFrom?, defaultUntil? }`. Overlapping default windows across suppliers return `400` with `code: "supplierWindowOverlap"` and the conflicting supplier names in `details`; duplicate name returns `409` |
| `PUT` | `/api/suppliers/[id]` | MAINTAINER | Update (same body/validation as create) |
| `DELETE` | `/api/suppliers/[id]` | MAINTAINER | Delete — blocked with `400` while assets reference the supplier |

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
| `GET` | `/api/stock` | VIEWER | List stock items. Optional `typeId`, `locationId` (≤ 64 chars) and `q` (≤ 200 chars); longer values are a `400` |
| `POST` | `/api/stock` | EDITOR | Create stock item |
| `GET` | `/api/stock/[id]` | VIEWER | Get stock item detail |
| `PUT` | `/api/stock/[id]` | EDITOR | Update stock item |
| `DELETE` | `/api/stock/[id]` | EDITOR | Delete stock item |
| `POST` | `/api/stock/[id]/deploy` | EDITOR | Deploy stock item as asset at a location |
| `POST` | `/api/stock/bulk-relocate` | EDITOR | Move several stock items to one storage location. Body: `{ ids (1–200), locationId }` (`null` clears the storage location). An item moved or deleted by another request meanwhile is reported as `STATUS_CHANGED` |

Deploy body: `{ locationId: string }`. Carries metadata (MAC, hostname, custom fields) from the stock item to the new asset. Returns `409` if the carried-over hostname is already assigned to another asset.

`GET /api/stock` accepts an optional `?locationId=` filter for the storage location. Create/update bodies accept an optional `locationId` — the physical storage location (a `Location`, same tree used for assets), distinct from `reservedForLocationId`.

---

## Users

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/users` | ADMIN | List users |
| `POST` | `/api/users` | ADMIN | Create user; `409` if the email is taken |
| `PUT` | `/api/users/[id]` | ADMIN | Update user. Rejects a password change for SSO accounts and demoting the last admin (`400`); `409` if the new email is taken |
| `DELETE` | `/api/users/[id]` | ADMIN | Delete user. `404` if unknown; `400` for your own account or the last admin |
| `GET` | `/api/users/me` | VIEWER | Current user's profile (also reachable while a forced password change is pending) |
| `PUT` | `/api/users/me` | VIEWER | Update own name, password (`currentPassword` required; not for SSO accounts), theme or default location tab |
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
| `POST` | `/api/auth/2fa/verify` | session | Verify TOTP code during login |
| `POST` | `/api/auth/passkey/registration-options` | session | Generate WebAuthn registration options |
| `POST` | `/api/auth/passkey/registration-verify` | session | Verify registration response, persist the passkey |
| `POST` | `/api/auth/passkey/authentication-options` | session (pending 2FA) | Generate WebAuthn authentication options during login |
| `POST` | `/api/auth/passkey/authentication-verify` | session (pending 2FA) | Verify passkey assertion during login |
| `DELETE` | `/api/auth/passkey/[id]` | session | Remove one of the current user's passkeys |

---

## Work Logs

Work logs are listed and created under their location: `GET`/`POST /api/locations/[id]/work-logs` (see [Locations](#locations)).

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/work-logs/[id]` | VIEWER | Get work log |
| `PUT` | `/api/work-logs/[id]` | EDITOR | Update work log — only its author or an ADMIN |
| `DELETE` | `/api/work-logs/[id]` | EDITOR | Delete work log — only its author or an ADMIN |

### Work log items (fixed)

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/work-log-items` | VIEWER | List fixed work log items |
| `POST` | `/api/work-log-items` | ADMIN | Create a fixed work log item (409 on duplicate name) |
| `PUT` | `/api/work-log-items/[id]` | ADMIN | Update a fixed work log item |
| `DELETE` | `/api/work-log-items/[id]` | ADMIN | Delete a fixed work log item (clears it from referencing work logs) |

---

## Import / Export

Where an export lives: whole-inventory exports (active assets, decommissioned assets, stock, the JSON snapshot) are under `/api/export/*` and accept the `EXPORT_TOKEN` for scheduled pulls. An export of one resource's own list stays under that resource — `/api/users/export`, `/api/compliance/hostname/export`, `/api/reports/[id]/export` — and needs a session.

| Method | Path | Min role | Description |
|---|---|---|---|
| `POST` | `/api/import/preview` | ADMIN | Parse an uploaded CSV without importing it: `{ totalRows, columns, preview }` (first 5 rows) |
| `POST` | `/api/import` | ADMIN | Bulk CSV import (creates assets, validates per row). Returns `{ ok, created, skipped, aborted, errors }`: a row the database rejects for its own data (duplicate hostname, value too long) is skipped with a reason; any other server error stops the import there (`aborted: true`) and the rows before it stay imported |
| `GET` | `/api/export/csv` | ADMIN or Bearer `EXPORT_TOKEN` | Download active-asset CSV export (status `INSTALLED` only) |
| `GET` | `/api/export/decommissioned` | ADMIN or Bearer `EXPORT_TOKEN` | Download decommissioned-asset CSV (adds decommission metadata columns) |
| `GET` | `/api/export/stock` | ADMIN or Bearer `EXPORT_TOKEN` | Download current stock inventory CSV |
| `GET` | `/api/export/snapshot` | ADMIN session or Bearer `EXPORT_TOKEN` | Point-in-time JSON inventory snapshot (assets incl. owner/criticality/end-of-support/supplier/disposal, suppliers, locations) — NIS2 evidence artifact |

---

## Compliance

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/compliance/hostname/export` | ADMIN | Download CSV of all hostnames that do not match their asset type's pattern (or the FQDN fallback). The report itself is viewed at **Administration → Compliance**. |

---

## Settings

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/settings/general` | VIEWER | Link templates: `hostnameUrlTemplate`, `macAddressUrlTemplate`, `locationUrlTemplate` |
| `PUT` | `/api/settings/general` | ADMIN | Update the link templates. An omitted field is left unchanged; `null` or `""` clears it (the same rule as the other settings PUTs) |
| `GET/PUT` | `/api/settings/compliance` | ADMIN | Security & compliance settings: `requireTwoFactor`, `auditRetentionDays` (30–3650), `defaultOwnerId`, `reviewWorkLogItemId`, `reviewPeriodMonths` (1–120) |
| `GET/PUT` | `/api/settings/export` | ADMIN | Scheduled export settings: `enabled`, `cronExpression`, `outputDir` |
| `GET` | `/api/settings/branding` | VIEWER | Branding settings (`appTitle`, `backgroundMode`, which images are set) |
| `PUT` | `/api/settings/branding` | ADMIN | Update `appTitle` and `backgroundMode` |
| `POST` | `/api/settings/branding/logo` | ADMIN | Upload the logo (`multipart/form-data`, `file` field; PNG, JPEG, SVG, WebP; max 2 MB) |
| `POST` | `/api/settings/branding/favicon` | ADMIN | Upload the favicon (ICO, PNG, SVG; max 1 MB) |
| `POST` | `/api/settings/branding/background` | ADMIN | Upload the login background image (PNG, SVG, WebP; max 2 MB); sets `backgroundMode` to `custom` |
| `DELETE` | `/api/settings/branding/{logo,favicon,background}` | ADMIN | Remove that image |

The uploaded images are served without authentication at `GET /api/branding/logo`, `/api/branding/favicon` and `/api/branding/background` (`404` when none is set, `502` with `code: "storageUnavailable"` when storage cannot be read), because the login page shows them.

---

## Audit Log

The audit log is viewed at **Administration → Audit log** (an ADMIN-only page that reads the database directly); there is no audit API.

Actions recorded: `CREATE`, `UPDATE`, `DELETE`, `IMPORT`, `EXPORT`, plus authentication events `LOGIN_SUCCESS`, `LOGIN_FAILED` (with reason: rate_limited / unknown_user / sso_only / invalid_password / TOTP failures), and `LOGOUT`. There is deliberately no delete endpoint — retention is enforced only by `scripts/purge-audit.mjs`.

---

## Search

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/search?q=…` | VIEWER | Full-text search across assets and locations; `q` over 200 characters is a `400` |

---

## Reports

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/reports` | VIEWER | List reports |
| `POST` | `/api/reports` | EDITOR | Create report |
| `GET` | `/api/reports/[id]` | VIEWER | Get report |
| `PUT` | `/api/reports/[id]` | EDITOR | Update report |
| `DELETE` | `/api/reports/[id]` | ADMIN | Delete report |
| `GET` | `/api/reports/[id]/export` | VIEWER | Export report results as CSV. Decommissioned assets are excluded by default unless the report's own filters explicitly target `status`. Contains every matching row (the on-screen result is capped at 5,000) |

Reports are run on the report page itself (a server component); there is no separate run endpoint.

---

## Prometheus

All endpoints use Bearer token authentication (`Authorization: Bearer <PROMETHEUS_SD_TOKEN>`); `/api/prometheus/sd` also accepts an ADMIN session, to browse it directly. Return 503 when `PROMETHEUS_SD_TOKEN` is not configured.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/prometheus/sd` | HTTP Service Discovery — returns target groups with `sam_*` labels |
| `GET` | `/api/prometheus/metrics` | Prometheus text format inventory metrics. Inventory gauges (totals, by-type, by-manufacturer, by-campus) count active (INSTALLED) assets only — decommissioned assets are historical and excluded |

---

## Grafana

A Grafana SimpleJSON-protocol datasource. Same Bearer token as Prometheus (`PROMETHEUS_SD_TOKEN`, 503 when unset); no session is accepted. See [Integrations → Grafana](integrations.md#grafana).

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/grafana` | Health check (`{ status: "ok" }`) |
| `POST` | `/api/grafana/search` | Available targets: `assets_table`, `assets_by_type`, `assets_by_manufacturer`, `assets_by_location`, `assets_by_install_year` |
| `POST` | `/api/grafana/query` | Run `targets`, narrowed by `adhocFilters` (`=` on `type`, `manufacturer`, `location`, `hostname`). Every target implicitly filters to active (INSTALLED) assets — decommissioned assets are historical and excluded, with no adhoc filter to opt back in |
| `POST` | `/api/grafana/tag-keys` | Ad-hoc filter keys |
| `POST` | `/api/grafana/tag-values` | Values for one key (`{ key }`). `hostname` values are limited to active (INSTALLED) assets |

---

## Miscellaneous

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/setup` | public | Check if setup is needed (returns `userCount`) |
| `POST` | `/api/setup` | public | Create first admin (only when `userCount === 0`) |
| `GET` | `/api/jira/issue/[key]` | VIEWER | Fetch JIRA issue summary and status (`{ found: false }` for an unknown key; 502 `jiraUnavailable` when JIRA cannot be reached) |
| `GET` | `/api/geocode?q=…` | EDITOR | Address search for the location map (OpenStreetMap Nominatim, up to 5 results). `400` `Invalid input` for a blank `q` or one over 200 characters; `502` with `code: "geocodeUnavailable"` when the geocoding service fails or times out (10 s) |
| `GET` | `/api/vault/test` | EDITOR | Test Vault connection for an asset's vault path (`?path=`, 1–500 chars). Returns the key names, never values. `400` `Invalid input` for a missing or over-long path, `400` `vaultSecretMissing` when nothing is stored there, `503` `vaultNotConfigured`, `502` `vaultDenied` / `vaultUnavailable` |

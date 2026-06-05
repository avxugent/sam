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
| `POST` | `/api/assets/[id]/decommission` | EDITOR | Mark asset decommissioned |
| `POST` | `/api/assets/[id]/reinstate` | EDITOR | Restore decommissioned asset |
| `POST` | `/api/assets/[id]/return-to-stock` | EDITOR | Move asset back to stock |
| `GET` | `/api/assets/by-hostname` | Bearer token | Grafana Infinity datasource lookup |

### Asset body (create/update)

Key validated fields:
- `locationId` — required
- `hostname` — when set, at least one MAC address is required
- `macAddresses` — array of MAC address strings
- `customFields` — array of `{ key, value }` objects
- `installationDate` — ISO date string

---

## Locations

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/locations` | VIEWER | List all locations (tree structure) |
| `POST` | `/api/locations` | EDITOR | Create location |
| `GET` | `/api/locations/[id]` | VIEWER | Get location with ancestor path |
| `PUT` | `/api/locations/[id]` | EDITOR | Update location (returns `409 LOCATION_NAME_EXISTS` with `targetId` when the new name collides with a sibling) |
| `POST` | `/api/locations/[id]/merge` | EDITOR | Merge this location into a sibling (`targetId`): moves its assets, sub-locations, attachments and work logs to the target, then deletes it |
| `DELETE` | `/api/locations/[id]` | EDITOR | Delete location and its assets. Blocked with `400 HAS_SUBLOCATIONS` if children exist, unless `?cascade=true` is passed — then the whole sub-tree is deleted |
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
| `PUT` | `/api/asset-types/[id]` | ADMIN | Update (including scrape template) |
| `DELETE` | `/api/asset-types/[id]` | ADMIN | Delete |
| `GET` | `/api/asset-types/[id]/assets` | VIEWER | Assets of this type |
| `POST` | `/api/asset-types/[id]/presets` | ADMIN | Create maintenance preset |
| `GET` | `/api/asset-types/presets/[id]` | VIEWER | Get preset |
| `PUT` | `/api/asset-types/presets/[id]` | ADMIN | Update preset |

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

Deploy body: `{ locationId: string }`. Carries metadata (MAC, hostname, custom fields) from the stock item to the new asset.

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

---

## Work Logs

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/work-logs` | VIEWER | List work logs (with optional JIRA summaries) |
| `POST` | `/api/work-logs` | EDITOR | Create work log |
| `GET` | `/api/work-logs/[id]` | VIEWER | Get work log |
| `PUT` | `/api/work-logs/[id]` | EDITOR | Update work log |
| `DELETE` | `/api/work-logs/[id]` | EDITOR | Delete work log |

---

## Import / Export

| Method | Path | Min role | Description |
|---|---|---|---|
| `POST` | `/api/import` | EDITOR | Bulk CSV import (creates assets, validates per row) |
| `GET` | `/api/export/csv` | ADMIN or Bearer `EXPORT_TOKEN` | Download full CSV export |
| `POST` | `/api/settings/export` | ADMIN | Trigger backup script |

---

## Audit Log

| Method | Path | Min role | Description |
|---|---|---|---|
| `GET` | `/api/audit-logs` | ADMIN | List audit log entries (filterable by entity, user, date) |

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
| `GET` | `/api/models` | VIEWER | List unique model strings (for autocomplete) |
| `GET` | `/api/jira/issue/[key]` | VIEWER | Fetch JIRA issue summary and status |
| `GET` | `/api/vault/test` | EDITOR | Test Vault connection for an asset's vault path |

---
title: "Database"
sync_to_confluence: true
---

# Database

SAM uses **MySQL 8** managed through **Prisma ORM**. The schema is the single source of truth at `prisma/schema.prisma`.

---

## Enums

### Role

```
ADMIN   → full access including user management and settings
EDITOR  → create/edit locations, assets, attachments; cannot manage users/types
VIEWER  → read-only access to all data
```

### AssetStatus

```
INSTALLED       → active, in-place asset
DECOMMISSIONED  → retired asset (kept in DB for audit history)
```

### Criticality

```
LOW / MEDIUM / HIGH / CRITICAL
```

Used on `AssetType.defaultCriticality` (type-level default) and `Asset.criticality` (per-asset override). The effective criticality of an asset is `asset.criticality ?? type.defaultCriticality ?? unclassified`.

### DisposalMethod

```
WIPED      → storage sanitised, device may be reused/resold
DESTROYED  → physically destroyed
RETURNED   → returned to supplier/lessor
RESOLD     → sold on
OTHER      → see decommission note
```

Recorded when an asset is decommissioned (NIS2 disposal evidence).

---

## Models

### User

Stores local and SSO-authenticated users.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string | Display name |
| `email` | string (unique) | Login identifier |
| `passwordHash` | string? | `null` for SSO users |
| `provider` | string | `"credentials"` or `"microsoft-entra-id"` |
| `role` | Role | ADMIN / EDITOR / VIEWER |
| `totpSecret` | string? | Encrypted TOTP seed |
| `totpEnabled` | bool | Whether 2FA is active |
| `mustChangePassword` | bool | Forces password change on next login |
| `twoFactorRequired` | bool | Admin-enforced 2FA requirement |
| `lastLoginAt` | DateTime? | Set on each successful login (access-review evidence) |

SSO users have `passwordHash = null`. The Credentials provider rejects them. Password change endpoints reject SSO accounts.

---

### PasswordResetToken

| Field | Type | Notes |
|---|---|---|
| `tokenHash` | string (unique) | Hashed reset token |
| `userId` | string | FK to User |
| `expiresAt` | DateTime | Token expiry |
| `usedAt` | DateTime? | Set when consumed |

---

### Location

Hierarchical tree of physical spaces (campus, building, floor, room, …).

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string | Display name |
| `description` | string? | Optional notes |
| `parentId` | string? | Self-referential FK (tree structure) |
| `order` | int | Sibling sort order |
| `fiNumber` | string? (unique) | Facility identifier — format: `CC.BB.FFF.RRR` |
| `address` | string? | Street address |
| `city` | string? | City |
| `postalCode` | string? | Postal code |
| `country` | string? | Country |
| `latitude` | float? | Map pin |
| `longitude` | float? | Map pin |
| `coverImageId` | string? | FK to Attachment used as hero image |
| `inMaintenance` | boolean | Default `false`. When `true`, assets in this room are excluded from Prometheus service discovery. Only rooms (leaf locations, no children) may be set — the API rejects it on a location with sub-locations |

`fiNumber` has a `@unique` constraint. Duplicate inserts return Prisma error `P2002` → API returns 409.

Ancestor path resolution uses a recursive CTE query in `lib/location-path.ts`.

---

### AssetType

Categories of assets (e.g., Projector, Display, Audio Processor).

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string (unique) | Display name |
| `scrapeTargetTemplate` | string? | Prometheus scrape template (newline-separated `key=value`) |
| `hostnamePattern` | string? | Regex (JS syntax) that hostnames for this type's assets must match |
| `defaultCriticality` | Criticality? | Default criticality for assets of this type; per-asset override wins |

The `scrapeTargetTemplate` field enables per-type Prometheus configuration. See [Integrations](integrations.md) for details.

`hostnamePattern` is tested case-insensitively and is not auto-anchored — the admin adds `^`/`$` if an exact full-string match is required. When null, assets of this type fall back to the generic FQDN check.

---

### Manufacturer

Hardware manufacturers.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string (unique) | Manufacturer name |

---

### AssetTypeManufacturerTemplate

Per-brand override of an `AssetType`'s default `scrapeTargetTemplate`, for manufacturers under that type whose devices need a different exporter/endpoint.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `typeId` | string | FK to AssetType, `onDelete: Cascade` |
| `manufacturerId` | string | FK to Manufacturer, `onDelete: Cascade` |
| `scrapeTargetTemplate` | string | Same format as `AssetType.scrapeTargetTemplate` |

`(typeId, manufacturerId)` has a `@@unique` constraint — one override per brand per type. Duplicate inserts return Prisma error `P2002` → API returns 409. See [Integrations](integrations.md) for the resolution order against the type's default template.

---

### AssetTypeModelTemplate

Per-model override, more specific than `AssetTypeManufacturerTemplate`, for a manufacturer + model combination under an `AssetType` whose devices need a different exporter/endpoint than the rest of that brand.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `typeId` | string | FK to AssetType, `onDelete: Cascade` |
| `manufacturerId` | string | FK to Manufacturer, `onDelete: Cascade` |
| `model` | string | Matched against `Asset.model` case-insensitively (trimmed) — `model` is free text, not a lookup table |
| `scrapeTargetTemplate` | string | Same format as `AssetType.scrapeTargetTemplate` |

`(typeId, manufacturerId, model)` has a `@@unique` constraint — one override per model per brand per type. Duplicate inserts return Prisma error `P2002` → API returns 409. See [Integrations](integrations.md) for the resolution order against the manufacturer and type-default templates.

---

### Supplier

Suppliers/resellers assets were purchased from (supply-chain evidence, distinct from Manufacturer).

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string (unique) | Supplier name |
| `contractReference` | string? | Framework/purchase contract reference |
| `contactInfo` | string? | Free-text contact details |
| `defaultFrom` | Date? | Start of the default window |
| `defaultUntil` | Date? | End of the default window (`null` = open-ended) |

**Default window**: an asset created without an explicit supplier while *today* falls within `[defaultFrom, defaultUntil]` is automatically assigned this supplier (all creation paths: manual, CSV import, stock deploy). `defaultFrom = null` disables the window. Windows may not overlap across suppliers — the API rejects overlapping windows with 400. The per-asset supplier can always be overridden.

Deleting a supplier that still has assets is blocked (route check + FK `onDelete: Restrict`).

---

### Asset

The core entity — a physical device installed in a location.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `locationId` | string | FK to Location |
| `typeId` | string? | FK to AssetType |
| `manufacturerId` | string? | FK to Manufacturer |
| `model` | string? | Model name (free text + autocomplete) |
| `serialNumber` | string? | Serial number |
| `hostname` | string? | Network hostname (globally unique) |
| `quantity` | int | Number of physical units this row represents (default `1`). Only meaningful for bulk items with no individual identity (e.g. speakers, batteries) — locked to `1` whenever `serialNumber`, `hostname`, or a MAC address is set |
| `installationDate` | DateTime? | When installed |
| `invoiceNumber` | string? | Purchase invoice reference |
| `warrantyMonths` | int? | Warranty period |
| `notes` | string? | Free-text notes |
| `vaultPath` | string? | Vault KV path for per-device credentials |
| `ownerId` | string? | Responsible person — soft ref to User (no FK, survives user deletion). Defaults to the `assets.defaultOwnerId` setting at creation when not provided |
| `criticality` | Criticality? | Per-asset override; `null` = inherit `AssetType.defaultCriticality` |
| `endOfSupportDate` | Date? | Vendor end-of-support; past dates flag the asset on the compliance dashboard |
| `supplierId` | string? | FK to Supplier; auto-assigned from the active default window at creation when not provided |
| `status` | AssetStatus | INSTALLED or DECOMMISSIONED |
| `decommissionedAt` | DateTime? | Set on decommission |
| `disposalMethod` | DisposalMethod? | Required at decommission (disposal evidence) |
| `decommissionedById` | string? | Who decommissioned — soft ref to User (no FK) |
| `lastLocationName` | string? | Snapshot of location name at decommission |
| `lastLocationFiNumber` | string? | Snapshot of FI number at decommission |

Assets with `hostname` are included in Prometheus Service Discovery output.

A hostname implies a MAC address is required (enforced via `superRefine()` in both form and API).

`hostname` carries a unique constraint across **all** assets regardless of `status` — a decommissioned asset keeps its hostname permanently (it is never reassigned to another asset), preserving an audit trail. Hostnames are also validated against the asset's type's `hostnamePattern` when set, falling back to a generic FQDN check otherwise. Attempting to reuse a hostname already assigned to another asset returns `409`.

"Total assets" figures shown for a location (sidebar tree, location list, location detail, search) sum `quantity` across matching rows rather than counting rows — a single row with `quantity=20` (a box of batteries) counts as 20 assets. This is enforced via `superRefine()` in both the form and the API: `quantity` must be `1` whenever the asset has a serial number, hostname, or MAC address.

---

### MacAddress

Multiple MAC addresses per asset (e.g., wired + wireless).

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `assetId` | string | FK to Asset |
| `address` | string | MAC address string |

---

### CustomField

Arbitrary key/value metadata per asset.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `assetId` | string | FK to Asset |
| `key` | string | Field name |
| `value` | string | Field value |

---

### Attachment

Files and links attached to locations or assets.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `attachmentType` | string | `"file"` or `"link"` |
| `filename` | string? | Stored filename on disk/S3 |
| `originalName` | string? | Sanitized original filename |
| `displayName` | string? | User-visible name |
| `description` | string? | Optional description |
| `mimeType` | string? | MIME type |
| `size` | int? | File size in bytes |
| `path` | string? | Relative storage path (file type only) |
| `url` | string? | External URL (link type only) |
| `locationId` | string? | FK to Location |
| `assetId` | string? | FK to Asset |
| `uploadedById` | string? | FK to User |

---

### AuditLog

Immutable record of every create, update, delete, import, and export action.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `timestamp` | DateTime | When the action occurred |
| `userId` | string? | FK to User (null if user deleted) |
| `userEmail` | string | Snapshot of user's email |
| `action` | string | `CREATE`, `UPDATE`, `DELETE`, `IMPORT`, `EXPORT` |
| `entityType` | string | E.g., `"Asset"`, `"Location"` |
| `entityId` | string | ID of the affected record |
| `entityName` | string | Human-readable name at time of action |
| `detail` | JSON? | Before/after diff or import summary |
| `ipAddress` | string? | Client IP |
| `userAgent` | string? | Browser user-agent |
| `forwardedAt` | DateTime? | When forwarded to syslog (null = pending) |

---

### AppSetting

Application-wide key/value settings (singleton rows).

| Field | Type | Notes |
|---|---|---|
| `key` | string (PK) | Setting name |
| `value` | string (Text) | Setting value |
| `updatedAt` | DateTime | Last modified |

---

### Report

User-defined custom reports.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string | Display name |
| `description` | string? | Optional description |
| `definition` | JSON | Query definition (schema in `lib/report-schema.ts`) |
| `createdById` | string? | FK to User (soft ref — not a DB constraint) |

---

### WorkLog

Maintenance and work history entries for locations and assets.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `locationId` | string? | FK to Location |
| `assetId` | string? | FK to Asset |
| `itemId` | string? | FK to WorkLogItem (`onDelete: SetNull`) — optional fixed item |
| `performedById` | string | FK to User |
| `performedAt` | DateTime | Date work was performed |
| `description` | string | What was done (empty string allowed when an item is set) |
| `jiraIssueKey` | string? | Optional JIRA issue key (e.g., `AVT-123`) |

---

### WorkLogItem

Admin-defined fixed work log items (e.g. *Review asset list*). Selecting one on a work log lets a location be tracked and reported on.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string | Display name (`@unique`) |
| `description` | string? | Optional description |
| `order` | int | Sort order (default 0) |

---

### MaintenancePreset

Reusable maintenance task templates per asset type.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `assetTypeId` | string | FK to AssetType |
| `name` | string | Task name |
| `description` | string? | Task description |

---

### StockItem

Pre-deployment inventory — hardware received but not yet installed.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `typeId` | string? | FK to AssetType |
| `manufacturerId` | string? | FK to Manufacturer |
| `model` | string? | Model name |
| `serialNumber` | string? | Serial number |
| `quantity` | int | Number of identical units |
| `notes` | string? | Free-text notes |
| `locationId` | string? | FK to Location — physical storage location (e.g. a storage room). `onDelete: Restrict`: a Location holding stock cannot be deleted. Distinct from `reservedForLocationId`. |
| `reservedForLocationId` | string? | Optional reservation — where the unit is earmarked to be deployed, not where it's stored |
| `invoiceNumber` | string? | Purchase invoice reference |
| `metadata` | JSON? | Extra fields (hostname, MACs, custom fields) carried to deployed asset |

---

## Database Scripts

```bash
npm run db:push        # Sync schema → DB without migration history (dev)
npm run db:migrate     # Create migration file + apply (production)
npm run db:generate    # Regenerate Prisma client after schema change
npm run db:studio      # Open Prisma Studio at http://localhost:5555
```

After `db push`, Prisma regenerates the client automatically. If it does not, run `npm run db:generate`.

---

## Notes for Developers

- **`COUNT(*)` returns `BigInt`** in MySQL — always wrap: `Number(row.count)`
- **Transactions** use `prisma.$transaction((tx: Prisma.TransactionClient) => { ... })` — type the callback parameter explicitly
- **Raw SQL** uses tagged template literals only: `prisma.$queryRaw\`SELECT ...\`` — never string concatenation
- **Unique constraint violations** return Prisma error code `P2002` — catch and return HTTP 409

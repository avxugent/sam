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
ADMIN      → full access including user management and settings
MAINTAINER → everything EDITOR can do, plus manage manufacturers/suppliers/models
EDITOR     → create/edit locations, assets, attachments; cannot manage users/types
VIEWER     → read-only access to all data
```

### AssetStatus

```
INSTALLED       → active, in-place asset
IN_REPAIR       → sent out for repair; not physically at its location
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
| `role` | Role | ADMIN / MAINTAINER / EDITOR / VIEWER |
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

### Passkey

WebAuthn credential — an alternative second factor to TOTP. Hand-rolled with `@simplewebauthn/server`; not a NextAuth Adapter table.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `userId` | string | FK to User (`onDelete: Cascade`) |
| `credentialId` | string (unique) | base64url credential ID |
| `publicKey` | string (`@db.Text`) | base64url-encoded COSE public key |
| `counter` | int | WebAuthn signature counter, bumped on each use |
| `transports` | string? | JSON-stringified `string[]` (e.g. `["internal","hybrid"]`) |
| `deviceType` | string | `"singleDevice"` or `"multiDevice"` |
| `backedUp` | bool | Whether the (multi-device) credential is synced/backed up |
| `label` | string | User-facing name, e.g. "Work laptop" |
| `createdAt` | DateTime | |
| `lastUsedAt` | DateTime? | Updated on each successful authentication |

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

### Model

Fixed lookup table for the Asset/StockItem "model" field — replaces the former free-text `Asset.model`/`StockItem.model` string columns. Admin-managed (`/admin/models`); there is no inline "create new model" from the asset/stock forms.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `typeId` | string | FK to AssetType |
| `manufacturerId` | string? | FK to Manufacturer — nullable because `StockItem.manufacturerId` is itself optional |
| `name` | string | Model name |
| `documentationUrl` | string? | Link to the model's documentation page. Required for compliance, but **not** enforced at creation/edit time — an admin can add a model to unblock inventory entry and fill this in later. Models and assets with no `documentationUrl` are flagged with a warning indicator in the admin Models list and on the asset detail page. |

`(typeId, manufacturerId, name)` has a `@@unique` constraint, scoped rather than a bare unique on `name` — the same model name can legitimately recur under different type/manufacturer combinations. Known limitation: MySQL unique indexes treat multiple `NULL`s as distinct, so two manufacturer-less models with the same `(typeId, name)` don't collide at the DB level — the API pre-checks this explicitly, and the admin merge feature cleans up any residual duplicates (including punctuation/spacing variants, which a straight uniqueness check can't catch).

Merging two Models (`POST /api/models/[id]/merge`) reassigns **both** `Asset.modelId` and `StockItem.modelId` from the source to the target, then deletes the source. Merging an `AssetType` or a `Manufacturer` moves the source's models onto the target with `reassignModels()` (`lib/models/reassign.ts`); a model whose `(typeId, manufacturerId, name)` already exists under the target is folded into that model (its assets and stock repointed, the source model deleted). The `Manufacturer` merge also reassigns `StockItem.manufacturerId` — the `SET NULL` foreign keys would otherwise silently strip the brand.

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
| `model` | string | Matched against the asset's resolved `Model.name` case-insensitively (trimmed) — this table's own `model` column is intentionally still free text, since the string-equality match is unaffected by where the compared string comes from |
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
| `lineageId` | string (cuid) | Stable identity that survives Asset ↔ StockItem conversions (return-to-stock, deploy-from-stock). Fresh on brand-new creation; copied forward on every conversion route so `AuditLog.lineageId` can reconstruct one physical item's full history across table hops. See [Asset history](#asset-history) |
| `locationId` | string | FK to Location |
| `typeId` | string? | FK to AssetType |
| `manufacturerId` | string? | FK to Manufacturer |
| `modelId` | string? | FK to Model — stays nullable, mirroring `typeId`/`manufacturerId` (legacy/imported rows may have no model) |
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
| `status` | AssetStatus | INSTALLED, IN_REPAIR, or DECOMMISSIONED |
| `decommissionedAt` | DateTime? | Set on decommission |
| `disposalMethod` | DisposalMethod? | Required at decommission (disposal evidence) |
| `decommissionedById` | string? | Who decommissioned — soft ref to User (no FK) |
| `lastLocationName` | string? | Snapshot of location name at decommission |
| `lastLocationFiNumber` | string? | Snapshot of FI number at decommission |
| `repairStartedAt` | DateTime? | Set when sent for repair; cleared on decommission |
| `repairNote` | string? | Optional note entered when sent for repair |
| `sentForRepairById` | string? | Who sent it for repair — soft ref to User (no FK) |

Assets with `hostname` are included in Prometheus Service Discovery output.

A hostname implies a MAC address is required (enforced via `superRefine()` in both form and API).

`hostname` carries a unique constraint across **all** assets regardless of `status` — a decommissioned asset keeps its hostname permanently (it is never reassigned to another asset), preserving an audit trail. Hostnames are also validated against the asset's type's `hostnamePattern` when set, falling back to a generic FQDN check otherwise. Attempting to reuse a hostname already assigned to another asset returns `409`.

"Total assets" figures shown for a location (sidebar tree, location list, location detail, search) sum `quantity` across matching rows rather than counting rows — a single row with `quantity=20` (a box of batteries) counts as 20 assets. This is enforced via `superRefine()` in both the form and the API: `quantity` must be `1` whenever the asset has a serial number, hostname, or MAC address.

#### Asset history

`Asset.lineageId` and `StockItem.lineageId` are copied forward on every conversion route (return-to-stock, deploy-from-stock), and stamped onto the corresponding `AuditLog.lineageId`. A single physical item's full history — across its hops between the `assets` and `stock_items` tables — is `SELECT * FROM audit_logs WHERE lineageId = ? ORDER BY timestamp`, exposed via `GET /api/assets/[id]/history`. A brand-new asset or stock item gets a fresh `lineageId`; a full single-unit deploy of a stock item (the only case where the new asset is genuinely "the same physical item") carries the stock item's `lineageId` forward instead. Rows predating this field, and audit rows for other entity types, have `lineageId = null` — run `scripts/backfill-lineage-ids.mjs` once after adding the column to assign existing rows a distinct id.

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
| `lineageId` | string? | Populated on Asset/StockItem lifecycle events — see [Asset history](#asset-history). `null` for other entity types and for rows predating this field |
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
| `definition` | JSON | Query definition (schema in `lib/schemas/report.ts`) |
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
| `lineageId` | string (cuid) | See `Asset.lineageId` — copied forward from the source Asset on return-to-stock; a fresh id is minted for genuinely new stock (manual create, CSV-imported bulk stock) |
| `typeId` | string? | FK to AssetType |
| `manufacturerId` | string? | FK to Manufacturer |
| `modelId` | string | FK to Model, `onDelete: Restrict` |
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
npm run db:migrate         # Create a migration from your schema.prisma edits + apply it locally (dev)
npm run db:migrate:deploy  # Apply committed, pending migrations only — no diffing (prod; run by the Nomad prestart "migrate" task on every deploy)
npm run db:push            # Push schema.prisma straight to the DB with no migration file (prototyping only — see below)
npm run db:generate        # Regenerate Prisma client after a schema change
npm run db:studio          # Open Prisma Studio at http://localhost:5555
```

Schema changes are tracked as committed SQL files under `prisma/migrations/`, applied in order — not diffed freshly against the live database on every deploy. This is deliberate: `db push`/an ad-hoc diff will refuse (and abort the *entire* deploy) the moment it hits an unsafe step, e.g. adding a required column to a table that already has rows — exactly what happened shipping `Asset.lineageId` (`@default(cuid())` is a Prisma **client-side** default, not a MySQL one, so it can't be added as `NOT NULL` to a populated table in one step). With committed migrations, that step is written as a safe *expand/contract* migration up front instead of failing mid-deploy.

**Workflow for a schema change:**
1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate` — generates `prisma/migrations/<timestamp>_<name>/migration.sql` from the diff and applies it to your local dev DB. Prisma warns if a step is unsafe; for a **required column with a non-DB-level default** (`cuid()`, `uuid()`) on a table that may already have rows, don't accept that raw diff as-is — instead run `npx prisma migrate dev --create-only`, then hand-edit the generated `migration.sql` into three steps: add the column nullable, `UPDATE ... SET col = UUID() WHERE col IS NULL` to backfill, then `ALTER TABLE ... MODIFY col ... NOT NULL`. See `prisma/migrations/20260930120000_add_asset_lineage_and_repair_status/migration.sql` for a worked example (adds `Asset.lineageId` and `StockItem.lineageId` this way).
3. Commit the new `prisma/migrations/<timestamp>_<name>/` folder along with the schema change — it's a permanent, ordered record; never edit or delete an already-committed migration file.
4. `npm run db:generate` if the client doesn't auto-regenerate.

`db:push` remains useful for quickly experimenting with a schema shape before you've committed to it, but never use it to ship a real change — it leaves no migration file, so the next `migrate deploy` (in CI/prod) won't know about it and other environments drift out of sync.

---

## Notes for Developers

- **`COUNT(*)` returns `BigInt`** in MySQL — always wrap: `Number(row.count)`
- **Transactions** use `prisma.$transaction((tx: Prisma.TransactionClient) => { ... })` — type the callback parameter explicitly
- **Raw SQL** uses tagged template literals only: `prisma.$queryRaw\`SELECT ...\`` — never string concatenation
- **Unique constraint violations** return Prisma error code `P2002` — catch and return HTTP 409

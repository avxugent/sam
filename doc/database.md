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

The `scrapeTargetTemplate` field enables per-type Prometheus configuration. See [Integrations](integrations.md) for details.

---

### Manufacturer

Hardware manufacturers.

| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string (unique) | Manufacturer name |

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
| `hostname` | string? | Network hostname |
| `installationDate` | DateTime? | When installed |
| `invoiceNumber` | string? | Purchase invoice reference |
| `warrantyMonths` | int? | Warranty period |
| `notes` | string? | Free-text notes |
| `vaultPath` | string? | Vault KV path for per-device credentials |
| `status` | AssetStatus | INSTALLED or DECOMMISSIONED |
| `decommissionedAt` | DateTime? | Set on decommission |
| `lastLocationName` | string? | Snapshot of location name at decommission |
| `lastLocationFiNumber` | string? | Snapshot of FI number at decommission |

Assets with `hostname` are included in Prometheus Service Discovery output.

A hostname implies a MAC address is required (enforced via `superRefine()` in both form and API).

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
| `performedById` | string | FK to User |
| `performedAt` | DateTime | Date work was performed |
| `description` | string | What was done |
| `jiraIssueKey` | string? | Optional JIRA issue key (e.g., `AVT-123`) |

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
| `reservedForLocationId` | string? | Optional reservation |
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

# Changelog

All notable changes to SAM are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.2] - 2026-06-01

### Added
- `scripts/resolve-ip-hostnames.mjs` — migration helper that reverse-DNS resolves bare IP addresses left in `Asset.hostname` by older imports and rewrites them to the resolved FQDN. Supports `--dry-run`, `--asset-id`, `--dns-server`, and `--timeout`. npm aliases: `assets:resolve-hostnames` / `:dry-run`.

### Fixed
- Attachment preview navigation arrows were invisible in dark mode (hardcoded white background); now use theme tokens.

---

## [1.0.1] - 2026-06-01

### Added
- Attachment preview dialog now navigates between images: prev/next arrows, ← → arrow keys, wrap-around, and a position counter. Cycles only through previewable images.

---

## [0.2.0-beta.3] - 2026-05-12

### Added
- Nomad Actions for all maintenance scripts: `sync-lokalen` (dry-run / metadata-only / full), `add-location-links`, `export-backup`, `forward-audit`, `clear-import-data`
- New `prod-deps` Dockerfile stage; scripts and their production dependencies are layered into the runner image under `scripts/node_modules/` for Nomad Action compatibility

### Fixed
- `sync-lokalen`: city and country are now hardcoded to Gent / Belgium (all UGent locations)
- Nomad actions use full binary path `/usr/local/bin/node` for compatibility

### Changed
- `jsdom` moved from devDependencies to dependencies (required at runtime by `sync-lokalen.mjs`)

---

## [0.2.0-beta.2] - 2026-05-12

### Fixed
- Restore missing `prisma` import in `app/page.tsx` (broke production build)
- Add missing `macAddressUrlTemplate` prop to `AssetTable` interface (broke TypeScript build)

---

## [0.2.0-beta.1] - 2026-05-12

### Added
- `scripts/sync-lokalen.mjs` — crawls `lokalen.ugent.be` per FI number to sync location name (room part only, strips building/campus suffixes), street address, and photos; validates ancestor hints against the location tree; supports local and S3 storage; handles Apache Wicket session cookies automatically
- Maintenance scripts documentation page under `doc/sam/technical/scripts.md`

### Fixed
- Search results: location asset count now uses a recursive CTE to include all descendant installed assets (was always showing 0 for container locations)
- Login redirect now always lands on the all-locations overview instead of the first location in the tree

### Changed
- Moved from alpha to beta

---

## [0.2.0-alpha.6] - 2026-05

### Added
- Confluence documentation sync via `@telefonica/markdown-confluence-sync`
- CI workflow: skip build/test on documentation-only changes

### Fixed
- Various Confluence sync configuration fixes (auth, workflow triggers, config format)
- ESLint: resolved all errors and warnings (`--max-warnings 0`)
- `fix(attachments)`: allow editing URL on link attachments

---

## [0.2.0-alpha.4] - 2026-05

### Added
- Audit log: meaningful change details for asset mutations across all write routes

---

## [0.2.0-alpha.3] - 2026-05

### Fixed
- Build: remove duplicate `useTranslations` import in move-asset-dialog

---

## [0.2.0-alpha.2] - 2026-05

### Added
- Attachment display names, descriptions, and image previews in gallery
- Column sorting on all data tables

### Fixed
- Mobile: replaced first-location redirect with expandable location tree browser

---

## [0.2.0-alpha.1] - 2026-05

### Added
- Internationalization (next-intl) with English (default) and Dutch
- Stock and decommissioning system with dedicated sidebar section
- S3-compatible storage backend abstraction (local and S3 drivers)
- Audit log forwarding to rsyslog (RFC 5424, UDP/TCP/TLS)
- `scripts/forward-audit.mjs` maintenance script

### Fixed
- Docker build: remove `next/font/google` (network unavailable at build time)
- Sidebar client manifest error (extract `StockNavItems` to own file)
- Various layout and routing fixes

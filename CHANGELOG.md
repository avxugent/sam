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

### Tests
- Raised coverage above the 80% gate with meaningful tests.

---

## [1.0.0-rc.7] - 2026-05-29

### Added
- Audit log now records all remaining user actions; added audit smoke tests.

### Fixed
- Footer date/time is localized to the app locale instead of the browser default.
- Branding logo replaces the Monitor icon only; the title text is always shown.

---

## [1.0.0-rc.6] - 2026-05-29

### Added
- Configurable branding: custom title, logo, favicon, and per-environment background.

---

## [1.0.0-rc.5] - 2026-05-29

### Added
- Reports: last-changed filter and column.

---

## [1.0.0-rc.4] - 2026-05-28

### Fixed
- Jira: show the link when only `JIRA_BASE_URL` is configured.
- Reports: replaced the "view" text button with an icon; run button is icon-only for consistency.
- Stock: table state now syncs after `router.refresh()`.
- Layout: footer moved outside the scroll region so it spans the full width.
- i18n: added the `reinstate` key to the decommissioned namespace.

### Changed
- `docker-build.sh`: added `--help`/`-h` usage documentation.

---

## [1.0.0-rc.2] - 2026-05-27

### Added
- Layout: footer with a live clock and the app version.

### Fixed
- Stock: added `typeId` and `manufacturerId` to the `StockItem` type.
- Reports: run button is now icon-only for consistency.

### Changed
- Added `docker-build.sh` for local CI-equivalent builds.

---

## [1.0.0-rc.1] - 2026-05-27

### Added
- Reports: show the full location path in report output.

### Fixed
- Asset types: resolved the `prometheusExposed` client mismatch and i18n variable.
- Stock: added the missing GET handler for a stock item by id; edit dialog now populates and shows current type and manufacturer values.
- Reports: delete button is red to match other pages.
- i18n: translated remaining hardcoded strings in the work log and asset form, the work log search placeholder, and the sublocation deletion error message.

---

## [0.2.0-beta.10] - 2026-05-26

### Added
- Assets: type-based icon instead of a fixed monitor icon.
- Assets: manufacturer field is now an autocomplete combobox; model autocomplete is filtered by type/manufacturer and prepopulated on select.
- i18n: translated form validation error messages.
- `scripts/reset-password.mjs` — admin password reset script.

### Fixed
- Scripts: fixed the tsx loader.

---

## [0.2.0-beta.9] - 2026-05-21

### Added
- Search: results paginate beyond 50 assets / 20 locations.

### Tests
- Added unit tests for the paginated search API.

---

## [0.2.0-beta.8] - 2026-05-19

### Added
- Asset types: `prometheusExposed` toggle for Service Discovery filtering.
- Asset types: offer to merge when renaming to an existing type name.

### Changed
- `sync-lokalen`: preserves existing address data and images.
- CI: added `workflow_dispatch` to the Docker workflow for manual triggers.

---

## [0.2.0-beta.7] - 2026-05-13

### Fixed
- Docker: updated maintenance scripts for Prisma 7.

### Security
- Override `@hono/node-server` to `>=1.19.13`.

---

## [0.2.0-beta.6] - 2026-05-13

### Fixed
- Build (Prisma 7): replaced all `@prisma/client` imports with `@/generated/prisma/client`, aliased `@prisma/client` → `generated/prisma/client.ts` in webpack, and added `mariadb` and `@prisma/adapter-mariadb` to `serverExternalPackages`.

---

## [0.2.0-beta.5] - 2026-05-13

### Changed
- Upgraded Prisma 6 → 7.

### Fixed
- Dark mode: amber/decommission button hover and warning colors are now readable.
- SSR: resolved hydration mismatches and a script tag warning.
- Audit: moved the `key` prop to the Fragment to silence the React list-key warning.
- i18n: escaped ICU placeholders in `hostnameTemplateHelp` and `macAddressTemplateHelp`.

---

## [0.2.0-beta.4] - 2026-05-13

### Added
- Profile: dark mode and location navigation preferences.
- This changelog (`CHANGELOG.md`).

### Fixed
- Map: proxy Nominatim geocoding through `/api/geocode`.

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

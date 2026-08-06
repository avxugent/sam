# Changelog

All notable changes to SAM are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0-alpha.5] - 2026-08-06

### Added

- **`Asset.quantity`** — a real quantity field for bulk items with no individual identity (speakers, batteries, cables). Locked to 1 whenever a serial number, hostname, or MAC address is set, enforced in both the asset form and the API — including a DB-aware check on update, so a partial request can't bypass it by simply omitting the existing serial/hostname/MAC. "Total assets" figures for a location (sidebar tree, locations list, location detail, search) now sum `quantity` instead of counting rows.
- **`assets:migrate-quantity` script** (`npm run assets:migrate-quantity`, dry-run: `npm run assets:migrate-quantity:dry-run`) — one-off migration moving the legacy free-text `"Quantity"` custom field (written by the old CSV import) onto the real field, then deleting it. Flags rather than applies anything unsafe: a value on an asset that also has a serial/hostname/MAC, or a non-numeric value.

### Changed

- CSV import's `QUANTITY` column now sets `Asset.quantity` directly instead of a free-text custom field; ignored (and flagged in the results) on rows that also have a serial number, hostname, or MAC.
- CSV export (active + decommissioned) gained a `QUANTITY` column sourced from `Asset.quantity`, keeping the import/export round-trip lossless.

### Removed

- Dangling `assets:sync-firmware` / `assets:sync-firmware:dry-run` npm scripts left over from the 2.0.0-alpha.4 firmware-currency revert — the script file no longer exists.

### Upgrading

1. `npx prisma db push` — adds `Asset.quantity` (`Int`, default `1`).
2. Optional: `npm run assets:migrate-quantity:dry-run` then `npm run assets:migrate-quantity` to move any existing `"Quantity"` custom field values onto the new column.

---

## [2.0.0-alpha.4] - 2026-08-05

Reverts the monitoring summary and firmware currency features shipped in
2.0.0-alpha.1. The plain "open in Grafana" links introduced alongside them are
unaffected — they always came from the generic location/hostname URL
templates, not from this code.

### Removed — Monitoring

- The monitoring summary on location and asset pages (device counts and
  availability read directly from `room:*`), and the per-user
  expanded/collapsed/hidden preference under Settings → Profile.
- `lib/prometheus-query.ts`, `components/monitoring/*`, `PROMETHEUS_URL` and
  `PROMETHEUS_TOKEN`.

### Removed — Firmware currency (NIS2)

- Firmware baselines admin screen, `assets:sync-firmware`, manual attestation
  on the asset page, and the firmware section of the NIS2 compliance
  dashboard (outdated / evidence expired / unmeasured).
- `FirmwareBaseline`, `FirmwareSource`, and `Asset.firmwareVersion` /
  `firmwareCheckedAt` / `firmwareSource` / `firmwareAttestedById`.
- `sam_asset_firmware_status`, `sam_asset_firmware_info`,
  `sam_firmware_baseline_info` and `sam_assets_firmware` from
  `/api/prometheus/metrics`. `sam_asset_info`, `sam_asset_maintenance` and
  `sam_asset_end_of_support_timestamp` are unaffected.

### Changed

- `sam-fleet` and `sam-device` Grafana dashboards: the baseline-comparison
  firmware panels are replaced with a browsable table/stat of raw
  `device_firmware_info`, read straight from exporters — there is no
  approved-baseline concept left anywhere in the system. The
  `room:firmware_outdated:count` / `room:firmware_unmeasured:count` recording
  rules are removed accordingly.

### Upgrading

1. `npx prisma db push` — drops `firmware_baselines`, four
   `assets.firmware*` columns, and `users.monitoringPanel`. **Destructive**:
   back up first if you want that data kept.
2. Redeploy `ops/` (`ops/jsonnet/build.sh`, then the Ansible roles) to update
   the fleet/device dashboards and drop the firmware recording rules.
3. `PROMETHEUS_URL` / `PROMETHEUS_TOKEN` are no longer read; safe to remove
   from your environment.

---

## [2.0.0-alpha.3] - 2026-08-03

### Fixed

- The asset table on a location page had no default sort — assets rendered in whatever order the API returned them (effectively insertion order). Now defaults to type, ascending; column sorting still works as before.

---

## [2.0.0-alpha.2] - 2026-08-03

### Fixed

- **Editing an asset could silently clear its type, owner, supplier or criticality.** The edit dialog applied the fetched asset's values before the async-loaded dropdown lists (asset types, users, suppliers) finished populating their `<Select>` options; once the matching option mounted, Radix fired a spurious `onValueChange("")` that wiped the field. Most visible when changing an unrelated field like manufacturer.

---

## [2.0.0-alpha.1] - 2026-07-30

First alpha of the 2.0 line: monitoring and firmware currency. **Pre-release —
the schema changes and the operational steps below have been exercised in
development only.**

### Added — Monitoring

- **Per-asset series in `/api/prometheus/metrics`.** `sam_asset_info` publishes the *expected* set of monitored assets from SAM's inventory, alongside `sam_asset_maintenance` and `sam_asset_end_of_support_timestamp`. Until now the endpoint emitted only aggregates, so nothing could answer "which devices are offline" — `up == 0` covers only targets service discovery already advertises, and assets in rooms flagged in maintenance are dropped from SD entirely. Every "expected but not reporting" query joins against this set.
- **Monitoring configuration as code** in the new `ops/` directory: Prometheus recording and alert rules, three Grafana dashboards (fleet, room, device) built from jsonnet, and two Ansible roles that deploy them through Grafana's file provisioning. Dashboards are read-only in the UI; `ops/jsonnet/build.sh` plus a clean `git diff` is what makes "recreate at any time" verifiable. promtool unit tests cover the down / maintenance / never-scraped split.
- **Monitoring summary on location and asset pages** — device counts and availability read directly from the `room:*` recording rules (`PROMETHEUS_URL`), rendered in SAM's own styling. Each user chooses expanded, collapsed or hidden under **Settings → Profile**; hidden skips the query entirely.
- **Location URL template** (Administration → Settings) alongside the existing hostname and MAC templates, with `{fi_number}`, `{location_name}` and `{location_id}`. Points anywhere; pointed at Grafana it adds a *Monitoring* badge to the location page.

### Added — Firmware currency (NIS2)

- **Firmware baselines** (Administration → Firmware Baselines) — the approved version per asset type, optionally narrowed to one model. *Firmware in the field* lists the versions devices actually report, grouped by type and model, with one-click creation of a baseline at the highest version seen.
- **`assets:sync-firmware`** reads `device_firmware_info` from Prometheus into `Asset.firmwareVersion`. The comparison happens in SAM, not in PromQL — PromQL cannot order version strings, and NIS2 wants an auditable record rather than a figure reconstructed from a dashboard.
- **Manual attestation** — devices with no API can never report firmware, so anyone but a Viewer can record a version on the asset page, stored with who and when. A device that later gains an API has its attestation replaced by the measured value.
- **Six firmware states, not two.** Only *compliant* (at or above baseline) is evidence of currency. *Outdated*, *stale* (reading older than `compliance.firmwareMaxAgeDays`, default 90), *unknown* (versions that cannot be ordered), *unclassified* (no baseline) and *no_data* (nothing ever established) are each counted separately, because reporting any of them as compliant would overstate coverage — most importantly for blackbox-probed devices, which can never self-report.
- **Firmware on the compliance dashboard** — outdated, evidence expired, and unmeasured, the last stating *measured coverage*: the share of assets whose currency can be judged at all, and the denominator every other firmware figure should be read against.

### Added — Development

- Grafana, a Prometheus rules mount and a **mock device exporter** in the dev stack, so the whole path — scrape template → service discovery → labels → recording rules → dashboards — can be exercised without reachable AV hardware.

### Changed

- **Remove `regex: "sam_(.*)" / action: labelmap` from your `scrape_configs`.** Prometheus already attaches every non-`__` SD group label to the scraped series, and `labelmap` *copies* rather than renames — leaving every device series carrying both `sam_model` and `model`, `sam_hostname` and `hostname`. Doubled cardinality, and the unprefixed copies can collide with labels an exporter sets natively. The documented examples previously showed this rule.
- **Exporter contract:** custom exporters should emit `probe_success`, not `<vendor>_probe_success`, matching blackbox_exporter. Vendor prefixes stay on genuinely vendor-specific metrics. A transitional recording rule bridges exporters that have not migrated.

### Fixed

- `prisma db push --skip-generate` fails on Prisma 7, which removed the flag. Affected both the dev image and `sam.nomad`'s prestart migrate task, so the next production deploy would have failed.
- The dev Vault healthcheck ran `vault status` without `VAULT_ADDR`, so the container never reported healthy and `app` never started.
- Scrape-template documentation advertised a `{vault_<key>}` substitution that does not exist — only `{vault_path}` is supported, and any other `{vault_*}` placeholder is passed through literally. The schema comment also showed `__param_target__`, which produces a query parameter named `target__`.

### Upgrading

1. `npx prisma generate && npx prisma db push` — adds `FirmwareBaseline`, firmware fields on `Asset`, and `User.monitoringPanel`.
2. Set `PROMETHEUS_URL` (and `PROMETHEUS_TOKEN` if required) for the monitoring summaries. Both are optional; without them the summary reports that it is not configured.
3. Deploy the Prometheus rules from `ops/` — every monitoring figure reads `room:*`.
4. Remove the `labelmap` relabel rule from your `scrape_configs` (see **Changed**).

---

## [1.6.0] - 2026-07-10

### Added — NIS2 compliance features
- **Authentication audit events** — successful logins, failed logins (with reason, including failed and rate-limited 2FA codes), and logouts are recorded in the audit log and forwarded to syslog like every other entry.
- **Asset owner** — assets carry a responsible person (soft user reference). A configurable default owner (e.g. a team account) is applied to newly created assets when none is chosen.
- **Criticality classification** — LOW/MEDIUM/HIGH/CRITICAL, with a default per asset type and an optional per-asset override; reports and the compliance dashboard use the effective value.
- **End-of-support tracking** — per-asset end-of-support date; assets past it are highlighted on the detail page and counted on the compliance dashboard.
- **Suppliers** (Administration → Suppliers) — supplier entities with contract reference, contact info, and a *default window*: assets created within the window without an explicit supplier are assigned it automatically (manual create, CSV import, stock deploy). Overlapping windows are rejected; per-asset override always possible.
- **Structured disposal evidence** — decommissioning now requires a disposal method (wiped/destroyed/returned/resold/other) and records who decommissioned the asset; both appear on the asset page and in the decommissioned CSV export. Reinstating clears them.
- **Audit log retention** — configurable retention (default 730 days) enforced by the new `scripts/purge-audit.mjs` cron script; unforwarded rows are never purged while syslog forwarding is configured. No delete API exists.
- **Access review** — users gain a *last login* timestamp (shown and sortable in the user table) and an ADMIN-only CSV export (name, email, role, provider, 2FA status, last login).
- **Global 2FA enforcement** — a settings toggle forces every local (credentials) account without TOTP into 2FA setup at next login.
- **Signed inventory snapshots** — `GET /api/export/snapshot` returns a point-in-time JSON inventory (session or export-token auth); `scripts/export-backup.mjs` now also writes the JSON snapshot plus a SHA-256 manifest alongside the CSV backup.
- **Compliance dashboard** (Administration → Compliance) — stat cards for assets without owner/classification, past end-of-support, locations missing their periodic inventory review, local users without 2FA, and the audit forwarding backlog, each with expandable sample lists. The hostname compliance report moved onto the same page. All counts are also exposed as Prometheus gauges (`sam_assets_missing_owner`, `sam_users_credentials_without_2fa`, …).
- **CSV round-trip** — the asset import/export format gained `OWNER` (email), `CRITICALITY`, `END_OF_SUPPORT`, and `SUPPLIER` columns; reports gained supplier/criticality/end-of-support filters and columns.
- New settings card **Security & compliance** (Administration → Settings): global 2FA requirement, audit retention days, default asset owner, review work-log item and review period.

---

## [1.5.0] - 2026-07-08

### Added
- New **Administration → Compliance** report showing, per asset type, the share of active hosts whose hostname matches the configured pattern — for demonstrating NIS2 compliance. Types without a configured pattern are measured against the generic FQDN check. Expand any type to see the non-compliant hosts, or export every non-compliant host as CSV. Assets with no hostname are reported separately and excluded from the rate.
- **Decommissioned CSV export** (Administration → Export) — a dedicated download of decommissioned assets, with decommission date, note, and last-location snapshot columns.
- **Stock CSV export** (Administration → Export) — a download of the current stock inventory.

### Changed
- The main CSV export is now explicitly the **active-asset** export: it contains only installed assets (assets in rooms that are in maintenance still count as active); decommissioned assets are available through the separate decommissioned export.

---

## [1.4.1] - 2026-07-07

### Fixed
- Creating a new asset no longer shows leftover data from a previous entry. If a create form was filled in and then dismissed without saving (Cancel or clicking outside), reopening it now starts blank instead of retaining the earlier values.

---

## [1.4.0] - 2026-07-06

### Added
- Asset **model names** get consistency tooling: when a model name similar to an existing one is entered, the asset form now shows a "Did you mean an existing model?" prompt offering to reuse the existing spelling — a soft warning only, you can still keep your own text.
- New **Administration → Model Cleanup** page: review clusters of similar-but-not-identical model spellings (asset count, type(s), and manufacturer(s) shown as context), pick or type the correct spelling, exclude individual entries that don't actually belong together, and merge with one click.
- **Rename a model** — from the same page, search for and batch-rename any model directly, including ones with no detected duplicates (e.g. a single consistently-misspelled entry).
- New maintenance script `assets:normalize-models` (`--dry-run` supported) auto-merges model spellings that differ only by case, whitespace, or punctuation.

---

## [1.2.0] - 2026-07-06

### Added
- Asset types can now define a **hostname format** (regular expression, configured under Administration → Asset Types). When set, hostnames for assets of that type must match it (case-insensitive); types without one fall back to the existing generic FQDN check.
- Hostnames are now **globally unique** across every asset, including decommissioned ones, so a hostname is never silently reused — attempting to reuse one returns a 409 conflict.

---

## [1.1.0] - 2026-06-29

### Added
- Asset reports gain a **Work log item** filter field with *is filled in* / *is not filled in* operators. Picking a [fixed work log item](doc/sam/user-guide/work-logs.md) restricts the report to assets that do (or do not) have a work log entry tagged with that item. Combine it with an asset-type filter to track a recurring work task across every asset of one type (e.g. *all projectors whose firmware-check item is not filled in*).

---

## [1.0.14] - 2026-06-24

### Fixed
- Prometheus now scrapes the **exporter** instead of the device for asset types whose scrape template sets `__address__`. Previously the device hostname was always used as the target group address, so a template pointing Prometheus at an external exporter was silently ignored and Prometheus connected directly to the device (e.g. `dial tcp …: no route to host`). The template `__address__` now becomes the scrape target, and any `http(s)://` scheme is lifted into the `__scheme__` label.
- Corrected scrape-template documentation and UI examples: Prometheus URL parameters use `__param_<name>` (e.g. `__param_target`), not `__param_<name>__`. The trailing `__` produced a malformed parameter name (`target__`). **Migration:** update existing asset-type templates to drop the trailing `__` from any `__param_*` lines.

---

## [1.0.13] - 2026-06-18

### Security
- Device credentials are no longer rendered into the Prometheus HTTP Service Discovery output. Previously `/api/prometheus/sd` fetched each device's secret from Vault and embedded the password in `__param_password__` labels, exposing every credential in plaintext to anyone holding `PROMETHEUS_SD_TOKEN` (and in Prometheus's own service-discovery debug pages and logs).

### Changed
- Scrape target templates now pass a non-secret `{vault_path}` reference instead of `{vault_<key>}` secret placeholders. The external exporter resolves the actual credential from Vault itself using its own Vault access. SAM no longer reads device passwords; its only Vault use is the asset-form **Test** button (lists key names, never values). **Migration:** update existing asset-type templates — replace `__param_user__={vault_username}` / `__param_password__={vault_password}` with `__param_vault_path__={vault_path}` (or the param your exporter expects).

---

## [1.0.12] - 2026-06-15

### Added
- Stock items now have an optional **MAC address** field on the create and edit forms. The MAC is stored on the item and carried over to the asset when a single unit is deployed (matching the existing hostname and custom-field carry-over behaviour).

---

## [1.0.11] - 2026-06-10

### Fixed
- Forms no longer crash when the browser's automatic page translation (Google Translate, Edge, Chrome built-in) is enabled. Translation rewrites the DOM text nodes, which broke React reconciliation on any form with conditional text — observed as 2FA setup and work log entry creation failing. The root `<html>` element now sets `translate="no"`, disabling browser auto-translation app-wide (the app already provides its own localisation via next-intl, so no translation capability is lost).

---

## [1.0.10] - 2026-06-09

### Fixed
- FI number validation now accepts a 2- or 3-digit room (last) segment, e.g. `14.10.100.13` as well as `14.10.100.013`. Previously the location form, the create/update location API, and CSV import all required exactly 3 digits, rejecting valid 2-digit room numbers. Existing 3-digit values remain valid.

---

## [1.0.9] - 2026-06-08

### Added
- **Fixed work log items.** Admins can define a list of reusable work log items (e.g. *Review asset list*) under **Admin → Settings → Work log items**. When adding a work log entry on a location or asset, technicians can tag it with one of these items; the description then becomes optional (the item alone records the entry). Managed via `GET/POST /api/work-log-items` and `PUT/DELETE /api/work-log-items/[id]` (admin only).
- **Location reports.** The report builder gains a report-type selector. *Location* reports produce a coverage matrix over the fixed work log items: every leaf location (no sub-locations) is a row and each selected item is a column showing whether it is filled in (with the date of the most recent entry) or not. Rows are grouped by campus then building, with rooms alphabetical. A **Show** filter limits rows to all / only filled / only not filled, and an optional **time window** (e.g. *within the last 1 year*) makes the check periodic — combine it with *Only not filled in* to list locations whose review is overdue. Results export to CSV.

---

## [1.0.8] - 2026-06-05

### Changed
- Deleting a location that has sub-locations is now possible. The confirmation dialog shows an extra checkbox requiring you to acknowledge that every sub-location — and all assets and attachments they contain — will be permanently deleted and cannot be recovered. The `DELETE /api/locations/[id]` endpoint accepts a `?cascade=true` flag that removes the whole sub-tree transactionally; without it, deleting a location with children still returns `400 HAS_SUBLOCATIONS`.

---

## [1.0.7] - 2026-06-05

### Changed
- The `sync-lokalen` maintenance script now also corrects the parent **building** and **campus** location names when they differ from the lokalen.ugent.be portal (previously it only warned). It additionally fills in their FI numbers, derived from the room's FI number: the campus gets the first group followed by zeroes (e.g. `14.00.000.000`) and the building the first two groups followed by zeroes (e.g. `14.10.000.000`).

---

## [1.0.6] - 2026-06-02

### Added
- Renaming a location to a name that already exists under the same parent now offers to **merge** the two instead of creating a duplicate. Confirming moves the edited location's assets, sub-locations, attachments and work logs into the existing location and deletes the edited one. A new `POST /api/locations/[id]/merge` endpoint performs the merge transactionally and rejects self/cross-parent merges.

---

## [1.0.5] - 2026-06-02

### Added
- Move a location to a new parent from the location detail page. The picker excludes the location itself, its descendants, and its current parent. When the location (or its sub-locations) has assets, a confirmation dialog warns that the assets move along with it. The API guards parent changes server-side, rejecting cycles (moving a location into itself or one of its own sub-locations).

### Fixed
- The asset detail action toolbar could push the **Move** button off-screen for assets with long names; the toolbar now wraps so all actions stay reachable.

---

## [1.0.4] - 2026-06-02

### Changed
- Listing/data views (Locations, Audit Log, Users, Asset Types) now fill the full available width instead of being constrained by a fixed `max-w-*` wrapper. Forms remain narrow for readability.

---

## [1.0.3] - 2026-06-01

### Fixed
- Maintenance scripts run via Nomad Actions failed with `ERR_MODULE_NOT_FOUND` for the generated Prisma 7 client. The shared `_prisma.mjs` helper now self-registers the tsx loader (so plain `node` invocations without `--import tsx/esm` work) and resolves the generated client from either the dev (`../generated/prisma`) or Docker runner (`scripts/generated/prisma`) layout. Fixes every Nomad maintenance action.

### Added
- Nomad Actions for the `resolve-ip-hostnames` migration script (dry-run and apply).

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

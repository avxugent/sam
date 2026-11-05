<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# SAM Project — Agent Rules

## Stack snapshot

| Layer | Package | Version |
|---|---|---|
| Framework | next | 16.4 |
| Language | typescript | ~5.9 |
| Runtime | node | 24 LTS |
| React | react | 19.3 |
| ORM | @prisma/client | 7.10 |
| Auth | next-auth | 5.0.0-beta.32 |
| Styling | tailwindcss | v4 (via `@import "tailwindcss"`) |
| Validation | zod | v4 |
| Forms | react-hook-form | v7 |
| i18n | next-intl | v4 |

---

## Next.js 16 breaking changes you must know

### `middleware.ts` is gone — use `proxy.ts`
The file is `proxy.ts` at the project root. The exported function must be named `proxy` (named export, not default). The `auth()` wrapper from NextAuth still works:
```ts
export const proxy = auth((req) => { … });
export const config = { matcher: […] };
```

### Route handler params are **async**
`params` in route handlers is a `Promise`. Always `await` it:
```ts
// ✅ correct
export async function GET(_req, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
// ❌ wrong — params.id will be undefined
export async function GET(_req, { params }) {
  const { id } = params.id;
}
```
Same applies to `searchParams` in page components.

### Tailwind CSS v4 — no `tailwind.config.*`
Configuration lives in `app/globals.css` using `@theme inline { … }` and CSS variables. Do **not** create a `tailwind.config.ts` or `tailwind.config.js` — it will be silently ignored. Design tokens are CSS custom properties under `:root`.

### `serverExternalPackages` replaces `experimental.serverComponentsExternalPackages`
Currently used for `bcryptjs`. If you add native Node modules used in server components, add them here.

### `overrides.postcss` in package.json is deliberate
Next pins postcss exactly (8.5.23) while Tailwind and Vite accept newer; the `>=8.5.10` override makes npm install one shared copy (and keeps out versions with the pre-8.5.10 advisory). Remove it only if `npm ls postcss` still shows a single version afterwards.

### `overrides.@typescript-eslint/typescript-estree.minimatch` is deliberate
typescript-estree pins `minimatch@^10.2.2`, whose latest 10.x is inside the GHSA-g3hv-75wg-m249 range (7.0.0 – 11.0.0); the scoped override installs a patched 11.x for it so `npm audit --audit-level=moderate` (a CI step) passes. Drop it once typescript-estree depends on a patched minimatch itself.

### `output: "standalone"` is enabled
The production build produces `.next/standalone/server.js`. The Dockerfile relies on this. Never set `output` to anything else.

---

## Project architecture

```
app/
  (auth)/          — login/ and its steps (2fa, setup-2fa, change-password), outside the dashboard layout
  (dashboard)/     — protected layout: sidebar + top nav header
    admin/         — admin sub-pages (users, asset-types, manufacturers, models, suppliers, import, export, audit, compliance, settings)
    locations/     — location detail + asset detail pages
    stock/         — stock items
    decommissioned/ — decommissioned assets
    in-repair/     — assets sent for repair
    reports/       — saved report builder + viewer
    settings/      — per-user profile (password, 2FA, passkeys)
    search/        — full-text search results
  api/             — all API route handlers
  setup/           — first-run wizard (no auth required)
  actions/locale.ts — setLocale, the only server action: writes the NEXT_LOCALE cookie (no data, no auth check) for the header language switcher; everything else goes through API routes
i18n/              — next-intl: locales.ts (supported locales en/nl, default, cookie name), request.ts (per-request locale from the cookie + message loading; wired in next.config.ts)
messages/          — en.json / nl.json, nested keys per area; add every key to both files
proxy.ts           — NextAuth session guard (replaces middleware.ts)
lib/               — shared code; modules importing next/server are route-handler helpers (server only)
                     (root files such as criticality.ts, mac-address.ts, hostname.ts and stock-metadata.ts are cross-domain value rules shared by assets, stock, import and compliance; lib/assets/ holds only asset lifecycle code)
  auth.ts          — NextAuth config + ssoEnabled flag; auth-session-upgrade.ts: upgradeSession(), how the 2FA routes re-issue the session after a second factor (lib/two-factor holds only primitives and never imports lib/auth)
  permissions.ts   — role predicates (isAdmin, canManageCatalog, canEdit); client-safe
  route-helpers.ts — readJsonBody, invalidInput, Prisma error checks, notFoundResponse / nameTakenResponse / unknownReferenceResponse, csvDownload
  prisma.ts        — PrismaClient singleton
  uploads/         — storage.ts: upload storage driver (local filesystem or S3) + attemptStorage / attemptStorageRead; policy.ts: attachment allowlists and size cap, content-vs-declared-type check, safeFilename
  passwords.ts     — hashPassword / BCRYPT_COST (server; also used by scripts/reset-password.mjs)
  app-settings.ts  — AppSetting key/value table: readSettings / writeSettings, plus typed groups (compliance, general, branding, export) that own each key, default and decoding
  criticality.ts   — criticality levels, parseCriticality, effectiveCriticality; client-safe
  dates.ts         — toIsoDay / formatDate; no dependencies (used by server exports and the UI)
  users/           — preferences.ts: theme / location-tab value sets (client-safe); providers.ts: AUTH_PROVIDERS / parseAuthProvider, how an account signs in (client-safe); names.ts: names behind soft user references (owner, decommissioned/sent-for-repair by)
  stock-metadata.ts — StockItem.metadata JSON (an asset's identity while in stock); client-safe
  mac-address.ts   — canonical MAC address form + validation; client-safe
  url-templates.ts — hostname / MAC / location link templates
  utils.ts         — cn(), formatFileSize, getInitials; client-safe
  api-client.ts    — apiFetch / jsonBody / downloadFile / saveBlob and apiErrorMessage (the error-body formatter) for client components; client-safe
  assets/          — lifecycle rules (pure), state transitions (writes + audit), history snapshot keys and change labels (audit ↔ timeline contract), assetLabel (display name), BulkResult / BulkSkipReason of the bulk endpoints (bulk.ts, client-safe), input checks + nested rows, shared response includes, creation defaults, type icons
  audit/           — logAudit (index), audit diffs, login-failure audit, syslog forwarding
  branding/        — logo/favicon/background upload + serve, background mode
  catalog/         — merge + rename-conflict protocol (merge routes, rename routes, admin merge UI)
  compliance/      — NIS2 and hostname compliance reports
  csv/             — CSV cell/parse core, asset CSV columns (shared by import, export and the import page), inventory export, import row parsing, import lookups, upload reading
  inventory-snapshot.ts — JSON inventory snapshot (export route + backup script)
  hostname.ts      — hostname pattern/FQDN rules
  integrations/    — HashiCorp Vault KV client, read-only Jira client, Nominatim geocoding (native fetch with a 10 s timeout, never throw; lookups report found / missing / unavailable), Grafana Explore link (GRAFANA_URL)
  locations/       — path.ts: recursive-CTE and other DB tree queries (server); tree.ts: nesting/flattening/filtering a location tree, the in-memory ancestor chain and the FI-number / path-string helpers (client-safe); include.ts: detail/page includes and LocationPageData; asset-quantities.ts: installed-unit counts for the location page
  models/          — model clustering + name similarity
  prometheus/      — sam_* labels, scrape template renderer, per-brand/model template overrides
  rate-limit/      — in-memory rate limiter (index) + client IP key and 429 response (http)
  reports/         — report engine + definition types
  schemas/         — Zod schemas shared by API routes and forms (asset, supplier, work-log, report, …), and ids.ts (idSchema / MAX_ID_LENGTH for every body or query id); no DB code
  suppliers/       — default-window rules and conflict lookup
  tokens/          — constant-time Bearer check, integration token (Prometheus/Grafana), session-or-token, session-or-export token
  two-factor/      — TOTP, WebAuthn passkeys, remember-device cookie, enrollment policy, sign-in steps, signing key (NEXTAUTH_SECRET, fails closed)
  stock/, work-logs/ — each only an include.ts: the relations a stock item row / a work-log entry is returned with
components/
  layout/          — Sidebar (locations only) + Header (search + admin + user), theme provider and sync
  ui/              — shadcn-style primitives (Button, Input, Dialog, …)
  assets/          — AssetFormDialog, AssetTable, AssetDetailClient, decommissioned/in-repair tables
  inventory/       — widgets shared by assets, stock and locations (location pickers, manufacturer + model autocomplete, MAC fields, bulk action dialog + results)
  locations/       — LocationFormDialog, LocationDetailClient, LocationMap, CoverImagePicker
  attachments/     — AttachmentGallery
  admin/           — clients for every /admin page: users and audit log at the top; catalog/ (asset types, manufacturers, models, suppliers, presets, template overrides, merge protocol UI, drilldown), settings/ (branding, general, compliance, work-log items), data/ (CSV import, export), compliance/ (hostname + NIS2 dashboards)
  settings/        — ProfileClient (per-user settings)
  stock/           — stock item table and dialogs
  reports/         — report builder, viewers, list
  search/          — SearchResults
  auth/            — login, forced password change / 2FA setup, 2FA challenge, 2FA and passkey settings
prisma/
  schema.prisma    — MySQL schema, source of truth
```

---

## Database — Prisma + MySQL 8

- Schema changes are tracked as committed migrations under `prisma/migrations/`, not `db push`. After changing `schema.prisma`, run `npm run db:migrate` (`prisma migrate dev`) to generate and apply a migration locally, and commit the resulting `prisma/migrations/<timestamp>_<name>/` folder with the schema change. `npm run db:migrate:deploy` (`prisma migrate deploy`) applies pending migrations in prod — the Nomad job runs it automatically before every deploy (`sam.nomad`, task `migrate`). Never use `db push` to ship a real change (see `doc/sam/technical/database.md#database-scripts`).
- **Required column with a non-DB-level default** (`@default(cuid())`, `@default(uuid())`) on a table that may already have rows: the raw diff Prisma generates will be a plain `NOT NULL` column add, which fails against a populated table. Run `npx prisma migrate dev --create-only` instead of accepting the auto-applied migration, then hand-edit `migration.sql` into three steps — add nullable, `UPDATE ... SET col = UUID() WHERE col IS NULL` to backfill, then `ALTER TABLE ... MODIFY col ... NOT NULL`. Worked example: `prisma/migrations/20260930120000_add_asset_lineage_and_repair_status/migration.sql`.
- After a migration, Prisma regenerates the client automatically. If it does not, run `npx prisma generate`.
- Never edit or delete an already-committed migration file — it's a permanent, ordered record. Fix forward with a new migration instead.
- Raw SQL is used only for the recursive location-tree CTEs in `lib/locations/path.ts` (ancestors, descendants, deepest-first subtree for deletes, per-location asset totals — optionally scoped to given roots, as search does). Put new tree queries there and cover them in `__tests__/integration/locations-path.int.test.ts`. Use `prisma.$queryRaw` with tagged template literals — never string concatenation.
- MySQL returns `COUNT(...)` as `BigInt`. Always wrap with `Number(row.count)`.
- `prisma.$transaction` callbacks receive a `Prisma.TransactionClient` — type it explicitly to avoid TypeScript errors.
- The `fiNumber` column on `Location` has a `@unique` constraint. Duplicate inserts return Prisma error code `P2002` — catch it and return a 409.

---

## Authentication

- **Session strategy**: JWT, 8-hour max age.
- **Two providers**: `Credentials` (email + bcrypt) and optionally `MicrosoftEntraID`. Entra ID is only active when all three `AUTH_MICROSOFT_ENTRA_ID_*` env vars are set. The `ssoEnabled` boolean is exported from `lib/auth.ts` and passed to the login page server component.
- **SSO users** have `passwordHash = null`. The `Credentials` provider rejects them. The `PUT /api/users/[id]` route rejects password changes for SSO accounts.
- **Roles**: `ADMIN > MAINTAINER > EDITOR > VIEWER` (Prisma `Role` enum; `session.user.role` is typed as `Role`). Viewers cannot write. Editors write inventory data (locations, assets, stock, work logs, reports). Maintainers additionally manage the catalog (manufacturers, models, suppliers). Admins can do everything, including users, asset types, settings, import/export and audit. Check roles only through the predicates in `lib/permissions.ts` (`isAdmin`, `canManageCatalog`, `canEdit`) — never compare role strings inline.
- Every API route handler performs its own auth check — do not rely solely on `proxy.ts`. The proxy is a redirect guard, not an authorization boundary.
- `auth()` from `lib/auth.ts` returns null for a session that still owes a login step (forced password change, 2FA setup, 2FA code; a remembered device waives the code), so every route and page sees only fully signed-in users. Only `proxy.ts` and the routes and pages that complete those steps (`/api/auth/2fa/*`, `/api/auth/passkey/*` registration/authentication, `/api/users/me`, `/login/2fa`) read the session with `authIncludingPendingSteps()`, and narrow it with `signInIncompleteResponse(session, allowedSteps)`. Never export or use NextAuth's raw `auth` elsewhere.
- The Prometheus and Grafana endpoints (`/api/prometheus/*`, `/api/grafana/*`) use Bearer token auth (`PROMETHEUS_SD_TOKEN`), not session cookies, and `/api/assets/by-hostname` accepts either. They are exempted from the proxy session redirect, as are `/api/export/*` (admin session or `EXPORT_TOKEN`, via `adminSessionOrExportToken(req)` in `lib/tokens/session-or-export.ts`) and the public `/api/branding/*` assets (logo, favicon, background, shown on the login page); the exempt handlers authenticate themselves and reject a session that still owes a login step (`signInIncompleteResponse`) (`integrationTokenResponse(req)` from `lib/tokens/integration.ts`; `sessionOrIntegrationTokenResponse(req, sessionAllowed)` from `lib/tokens/session-or-integration.ts` where a session is also accepted).

---

## API route conventions

- All handlers return `NextResponse.json(...)`.
- Auth errors: `401` for unauthenticated, `403` for insufficient role.
- A helper that either yields a value or the response to send back returns `{ <value> } | { error: Response }`; callers write `if ("error" in result) return result.error;` (readCsvUpload, readFormData, readMergeRequest, attemptStorage, adminSessionOrExportToken).
- Read request bodies with `readJsonBody(req)` (malformed JSON becomes a Zod 400, not a 500) and return Zod failures with `invalidInput(parsed.error)` — `400` with `{ error: "Invalid input", details }`.
- Error bodies are `{ error, code?, details? }`: `error` is readable English, `code` a stable id for a case the client localizes, `details` either `string[]` or the Zod flatten object. Client components call the API through `apiFetch()` from `lib/api-client.ts` (it never throws: a network failure is `{ ok: false, status: 0 }`, a body-less 500 gives `error: {}`), show `res.error` with `useApiErrorToast()` (or `apiErrorMessage()` from `lib/api-client.ts` for inline messages), and download CSV exports with `downloadFile()`. Client code never calls `fetch` directly (pass an `AbortSignal` in the init and check `signal.aborted` for superseded requests); build JSON requests with `jsonBody(method, body)`.
- Server pages hand dates to client components as ISO strings (`toISOString()`, or `toIsoDay()` for day-only columns) — the shape the API returns, so a client list can be replaced by an `apiFetch` result without a second type.
- Missing records: `404` only for the record named in the URL path (`notFoundResponse("Model")` → "Model not found."); an id inside the request body that names no record is invalid input — `400` with `code: "unknownReference"` (`unknownReferenceResponse()`; catch `isForeignKeyError(err)` on writes).
- Conflict (unique constraint): `409` (`nameTakenResponse()`, or `nameConflictResponse()` for catalog renames that can offer a merge). Detect it with `isUniqueConstraintError(err)`; never map every caught error to one status — rethrow what you don't handle.
- `DELETE` handlers return `200` with `{ ok: true }`.
- All write endpoints validate input with Zod before touching the database.
- Zod schemas enforce length caps on all string fields, including query parameters (parse `Object.fromEntries(searchParams)` with a small schema and answer `invalidInput`). Record ids use `idSchema` / `MAX_ID_LENGTH` from `lib/schemas/ids.ts`. Do not remove them.
- Cross-field validation (e.g. hostname → MAC required) uses `.superRefine()`. Shared schemas live in `lib/schemas/` and are imported by the API routes (and by the form when no translated messages are needed); the asset form mirrors `lib/schemas/asset.ts` with translated messages, so the server check can never be bypassed.

---

## Forms and validation

- Forms use `react-hook-form` with `zodResolver`.
- The Zod schema in the form component and its mirror in the API route must stay in sync. Prefer importing from `lib/schemas/`; where a form keeps its own copy (translated messages), change both.
- Use `setValue(field, value, { shouldValidate: true })` when programmatically setting values in `Select` components so errors clear immediately.
- Call `trigger("fieldName")` when a cross-field dependency changes (e.g. when hostname changes, re-trigger MAC validation).
- Required fields get a visible `*` marker: `<span className="text-destructive">*</span>`.
- Error messages appear directly below their input using `<p className="text-xs text-destructive">`.
- Inputs with errors get `className={cn("...", errors.field && "border-destructive")}`.

---

## UI components

- All UI primitives live in `components/ui/`. They are hand-written shadcn-style components, **not** auto-generated by the shadcn CLI.
- Do not run `npx shadcn@latest add` — it will overwrite the existing components with incompatible versions.
- Use `cn()` from `lib/utils.ts` (a `clsx` + `tailwind-merge` wrapper) for conditional class names.
- Icons: Lucide React only. Import from `lucide-react`.
- All dialogs use `@radix-ui/react-dialog` via the `Dialog` wrapper in `components/ui/dialog.tsx`.
- Toast notifications use `useToast()` from `components/ui/use-toast.ts`. A failed API call is shown with `useApiErrorToast()` (`components/ui/use-api-error-toast.ts`): the server's message, or the generic fallback when the response had none.

---

## File uploads

- Files go through the storage driver in `lib/uploads/storage.ts`: the local filesystem under `UPLOAD_DIR` (default `./uploads`), or an S3-compatible bucket when `STORAGE_DRIVER=s3` and `S3_BUCKET` are set.
- Upload policy lives in `lib/uploads/policy.ts`: the attachment MIME and extension allowlists (separate, to prevent double-extension attacks like `.jpg.php`), the 50 MB cap, and `contentMatchesType()` (magic bytes / no NUL in text), which branding uploads use too.
- All file paths are resolved with `path.resolve()` and checked against the upload root with `assertSafePath()` to prevent path traversal.
- `originalName` goes through `safeFilename()` (`lib/uploads/policy.ts`: `\r`, `\n`, `"`, `\` become `_`, capped at 255) before storing in the database.
- Max upload size: 50 MB.
- In Docker, `uploads/` is a named volume — never bake uploaded files into the image.

---

## Prometheus integration

- `/api/prometheus/sd` — HTTP Service Discovery. Returns assets with hostnames as target groups with `sam_*` labels. If the asset type has a `scrapeTargetTemplate`, it is rendered and its `__labels__` are merged in.
- `/api/prometheus/metrics` — Prometheus text format inventory metrics. No `prom-client` dependency — the format is built as a plain string.
- `/api/assets/by-hostname` — Grafana Infinity datasource lookup. Accepts session cookie OR Bearer token.
- Template syntax: newline-separated `key=value` pairs. Variables: `{hostname_fqdn}`, `{serial}`, `{model}`, `{manufacturer}`, `{fi_number}`, `{vault_path}` (the asset's Vault path reference, never the secret itself). Validated server-side via `validateTemplate()` in `lib/prometheus/scrape-template.ts`.
- Vault client (`lib/integrations/vault.ts`) uses native `fetch`. Never throws: `readVaultSecret()` reports `found`, `missing`, `denied` or `unavailable`. It backs the Vault path check in the asset form (`/api/vault/test`, any role that can edit assets; it returns key names, never values); the SD endpoint only passes the non-secret `{vault_path}` reference and never reads Vault.

---

## Security rules — do not regress

- All HTTP responses already include security headers (CSP, HSTS, X-Frame-Options, etc.) via `next.config.ts`. Do not remove or weaken them.
- The CSP `frame-src` allows `https://www.openstreetmap.org` for the map embeds — if you add other embeds, add their origin here.
- Never log secrets, passwords, or Vault token values.
- `PROMETHEUS_SD_TOKEN`, `VAULT_TOKEN`, `VAULT_SECRET_ID`, and AppRole-derived tokens must never be returned in API responses.
- Do not add new unauthenticated public routes without explicit discussion.
- Passwords are hashed with bcrypt cost 13. Do not lower the cost factor.
- The `/api/setup` endpoint checks `userCount === 0` before allowing admin creation. Do not remove this guard.
- JWT sessions expire in 8 hours (`maxAge: 8 * 60 * 60`). Do not increase this without discussion.

---

## Docker

- The `Dockerfile` uses a four-stage multi-stage build: `deps → scripts-deps → builder → runner`. `scripts-deps` installs `scripts/package.json` (the maintenance scripts' few dependencies, pinned to the root lockfile's versions — `__tests__/scripts/manifest.test.ts` checks it) into `scripts/node_modules` for the Nomad maintenance actions; it also provides the Prisma CLI used by `prisma migrate deploy`. The runner copies `lib/` and `generated/prisma/` into `scripts/` too.
- Maintenance scripts import shared code from `lib/` (`@/lib/...`) instead of re-implementing it; run them with `node --import tsx/esm scripts/<name>.mjs` (the npm shorthands and Nomad actions do). A new dependency of a script — or of a `lib/` module a script imports — goes into `scripts/package.json` too.
- The runner image runs as non-root user `nextjs` (uid 1001). Do not run as root.
- `NEXT_TELEMETRY_DISABLED=1` is set at build time and runtime.
- The standalone output (`next.config.ts`: `output: "standalone"`) is used. The entrypoint is `node server.js`.
- `uploads/` is a named Docker volume — do not add it to the image.
- All secrets come from environment variables. Never hardcode credentials.
- `docker-compose.yml` is the production stack (app + MySQL). `docker-compose.dev.yml` is MySQL-only for local dev.

---

## Environment variables

Key variables (always present):
- `DB_HOST` — MySQL hostname
- `DB_PORT` — MySQL port (default: `3306`)
- `DB_NAME` — Database name
- `DB_USER` — Database username
- `DB_PASSWORD` — Database password
- `DB_SSL` — `true` to require TLS (`sslaccept=strict`), `false` to disable (default)
- `NEXTAUTH_SECRET` — JWT signing secret (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` — full public URL, no trailing slash

Optional integrations:
- `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` — Entra ID SSO
- `PROMETHEUS_SD_TOKEN` — Bearer token for `/api/prometheus/*` endpoints
- `VAULT_ADDR` / `VAULT_KV_VERSION` — HashiCorp Vault (required when Vault is used)
- `VAULT_TOKEN` — static token auth
- `VAULT_ROLE_ID` / `VAULT_SECRET_ID` / `VAULT_APPROLE_MOUNT` — AppRole auth (takes precedence over `VAULT_TOKEN` when both are set)

`.env.example` is the canonical reference. Always update it when adding new variables.

---

## Testing

### Framework and tooling

| Tool | Purpose |
|---|---|
| **Vitest** | Unit and component test runner (`npm test`) |
| **@testing-library/react** | DOM-based component testing |
| **@testing-library/user-event** | Realistic browser interaction simulation |
| **@testing-library/jest-dom** | DOM matchers (`.toBeInTheDocument()`, etc.) |
| **jsdom v29** | Browser environment for component tests. Requires Node 22.12+ (`require(esm)` support); do not downgrade Node below 22.12 or jsdom below v29. |
| **@vitest/coverage-v8** | V8-based code coverage |

### Running tests

```bash
npm test                # run all tests once
npm run test:watch      # watch mode
npm run test:coverage   # run with coverage report + enforce thresholds
npm run test:ui         # open Vitest UI in browser
npm run test:integration # opt-in: raw SQL against a real MySQL (DB_* env), see __tests__/integration/
```

> **Always run `npm test` after making any code change** and confirm the output shows no failures before considering the task complete. A passing test run is the minimum bar — never leave tests broken.

The project requires **Node 24** (pinned via `.nvmrc`). If `npm test` fails with `ERR_REQUIRE_ESM` from `html-encoding-sniffer`, you are on the wrong Node version. Run `nvm use` in the project root to switch automatically.

### Coverage requirement — **80% minimum**

The project enforces an 80% minimum threshold on **lines, functions, branches, and statements** for all covered files. The CI pipeline fails if coverage drops below this. Run `npm run test:coverage` before pushing.

Coverage is measured on:
- `lib/**/*.ts` — all shared utilities (excluding `lib/prisma.ts`); `lib/auth.ts` is tested by capturing the config it hands to `NextAuth()` (`__tests__/lib/auth.test.ts`)
- `app/api/**/*.ts` — route handlers that have corresponding test files
- `components/**/*.tsx` — UI components that have corresponding test files

Coverage measurement excludes infrastructure-only files (the PrismaClient singleton), pass-through re-exports, and complex UI-only components that are tested functionally rather than by line coverage.

### Test file location

Test files live in `__tests__/` mirroring the source structure:

```
__tests__/
  lib/        ← unit tests for lib/* functions
  api/        ← mocked route handler tests
  components/ ← React component tests
```

### Rules for writing tests

1. **Every new `lib/` function must have a unit test.** Pure functions (no I/O) are the highest-value test targets.
2. **Every new API route must have at least a smoke test** covering: unauthenticated (401), wrong role (403), happy path (2xx), and key validation errors (400).
3. **Zod validation schemas are mirrored** in both the form component and API route. The test suite must cover the shared validation rules.
4. **Mock Prisma at the module level** using `vi.mock("@/lib/prisma", ...)` — never connect to a real database in unit tests.
5. **Mock `@/lib/auth`** when testing API routes that call `auth()`.
6. **Never import from `next/server` in pure unit tests** without mocking it — it causes `ERR_REQUIRE_ESM` in the test worker.
7. **Component tests use `@testing-library/react`** — query by role/label/text, not by CSS class or test-id.
8. **`vi.mock()` calls must be at the top level** of the test file (before any `import` of the module under test). Do **not** reference variables declared in the same file inside a `vi.mock()` factory — the factory is hoisted above all declarations and will throw `ReferenceError`. Instead, use `vi.fn()` directly inside the factory and retrieve typed handles via `vi.mocked()` after the import.
8a. **When mocking `auth` from `@/lib/auth`**, always cast mock return values with `as never` (e.g. `mockAuth.mockResolvedValue(null as never)`) — next-auth v5's `auth` has a middleware overload that makes TypeScript reject plain session objects otherwise.
9. **Do not write snapshot tests** — they are brittle and add noise without meaningful coverage.
10. **The `reducer` exported from `components/ui/use-toast.ts` is a pure function** — test it directly without rendering any React.

### vitest.config.mts location

The Vitest config is at `vitest.config.mts` and setup file is `vitest.setup.mts`. The `.mts` extension was previously required because the project was declared CJS; now that `"type": "module"` is set in `package.json`, `.ts` would also work. The `.mts` names are retained as an explicit ESM signal — do not change them to `.js`.

---

## Common mistakes to avoid

1. **Do not use `params.id` directly** — always `const { id } = await params`.
2. **Do not create `tailwind.config.ts`** — Tailwind v4 reads from `globals.css`.
3. **Do not `import` from `next/server` in client components** — only in route handlers and `proxy.ts`.
4. **Do not use `middleware.ts`** — use `proxy.ts` with a named `proxy` export.
5. **Do not call `npx shadcn`** — UI components are hand-maintained.
6. **Do not use `multer`** — it was removed. File uploads use the native `formData()` API.
7. **Do not use `@auth/prisma-adapter`** — it was removed. Auth uses JWT strategy only.
8. **Do not bypass Zod validation** in API routes — all user-controlled input must be validated before reaching Prisma.
9. **Do not store secrets in the codebase** — use environment variables.
10. **Do not hardcode MySQL queries as raw strings** — use Prisma's typed API or `$queryRaw` with tagged template literals.
11. **Do not rename `vitest.config.mts` to `vitest.config.js`** — `.mts` and `.ts` are both valid in this ESM project, but `.js` would drop type safety.
12. **Do not downgrade jsdom below v29 or Node below 22.12.** jsdom v29 requires Node 22.12+ stable `require(esm)` support — on older Node versions tests will fail with `ERR_REQUIRE_ESM` from `html-encoding-sniffer`.
13. **Always run `npm test` after every code change** — confirm zero failures before moving on. Run `npm run test:coverage` before pushing to also enforce the 80% threshold.
14. **Run tests with Node 24** — use `nvm use` in the project root (`.nvmrc` pins the version). Tests fail with `ERR_REQUIRE_ESM` on Node 20 or below due to jsdom v29's ESM requirement.
15. **Keep documentation in sync** — the `doc/` folder contains source documentation published to Confluence. When making changes that affect architecture, API routes, database schema, configuration, authentication, deployment, or integrations, update the relevant file(s) in `doc/sam/` as part of the same task. Do not leave docs describing behaviour that no longer exists.

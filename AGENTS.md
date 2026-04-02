<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# SAM Project — Agent Rules

## Stack snapshot

| Layer | Package | Version |
|---|---|---|
| Framework | next | 16.2.1 |
| Language | typescript | ~5.9 |
| Runtime | node | 20 LTS |
| React | react | 19.2 |
| ORM | @prisma/client | ~6.19 |
| Auth | next-auth | 5.0.0-beta.30 |
| Styling | tailwindcss | v4 (via `@import "tailwindcss"`) |
| Validation | zod | v3 |
| Forms | react-hook-form | v7 |

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

### `output: "standalone"` is enabled
The production build produces `.next/standalone/server.js`. The Dockerfile relies on this. Never set `output` to anything else.

---

## Project architecture

```
app/
  (auth)/          — login page (outside dashboard layout)
  (dashboard)/     — protected layout: sidebar + top nav header
    admin/         — admin sub-pages (users, asset-types, manufacturers, import)
    locations/     — location detail + asset detail pages
    search/        — full-text search results
  api/             — all API route handlers
  setup/           — first-run wizard (no auth required)
proxy.ts           — NextAuth session guard (replaces middleware.ts)
lib/               — shared server utilities
  auth.ts          — NextAuth config + ssoEnabled flag
  prisma.ts        — PrismaClient singleton
  vault.ts         — HashiCorp Vault KV client (native fetch, no extra deps)
  scrape-template.ts — Prometheus scrape URL template renderer
  location-path.ts — recursive CTE ancestor resolver
  prometheus-auth.ts — Bearer token check for /api/prometheus/*
components/
  layout/          — Sidebar (locations only) + Header (search + admin + user)
  ui/              — shadcn-style primitives (Button, Input, Dialog, …)
  assets/          — AssetFormDialog, AssetTable, AssetDetailClient
  locations/       — LocationFormDialog, LocationDetailClient, LocationMap, CoverImagePicker
  attachments/     — AttachmentGallery
  settings/        — LookupListManager, AssetTypesClient, UsersClient
  search/          — SearchResults
  import/          — CsvImportClient
  auth/            — LoginClient
prisma/
  schema.prisma    — MySQL schema, source of truth
```

---

## Database — Prisma + MySQL 8

- **Always** run `npx prisma db push` (dev) or `npx prisma migrate dev` (prod) after changing `schema.prisma`.
- After `db push`, Prisma regenerates the client automatically. If it does not, run `npx prisma generate`.
- Raw SQL is used in two places: recursive CTE for asset counts (`lib/`) and the `getAllDescendantIds` helper. Use `prisma.$queryRaw` with tagged template literals — never string concatenation.
- MySQL returns `COUNT(...)` as `BigInt`. Always wrap with `Number(row.count)`.
- `prisma.$transaction` callbacks receive a `Prisma.TransactionClient` — type it explicitly to avoid TypeScript errors.
- The `fiNumber` column on `Location` has a `@unique` constraint. Duplicate inserts return Prisma error code `P2002` — catch it and return a 409.

---

## Authentication

- **Session strategy**: JWT, 8-hour max age.
- **Two providers**: `Credentials` (email + bcrypt) and optionally `MicrosoftEntraID`. Entra ID is only active when all three `AUTH_MICROSOFT_ENTRA_ID_*` env vars are set. The `ssoEnabled` boolean is exported from `lib/auth.ts` and passed to the login page server component.
- **SSO users** have `passwordHash = null`. The `Credentials` provider rejects them. The `PUT /api/users/[id]` route rejects password changes for SSO accounts.
- **Roles**: `ADMIN > EDITOR > VIEWER`. Viewers cannot write. Editors cannot manage users/types/manufacturers. Admins can do everything.
- Every API route handler performs its own auth check — do not rely solely on `proxy.ts`. The proxy is a redirect guard, not an authorization boundary.
- The Prometheus endpoints (`/api/prometheus/*`) use Bearer token auth (`PROMETHEUS_SD_TOKEN`), not session cookies. They are exempted from the proxy session redirect. Their route handlers call `checkPrometheusAuth(req)` directly.

---

## API route conventions

- All handlers return `NextResponse.json(...)`.
- Auth errors: `401` for unauthenticated, `403` for insufficient role.
- Validation errors: `400` with `{ error: string, details?: … }`.
- Conflict (unique constraint): `409`.
- All write endpoints validate input with Zod before touching the database.
- Zod schemas enforce length caps on all string fields. Do not remove them.
- Cross-field validation (e.g. hostname → MAC required) uses `.superRefine()` — the same schema is duplicated in the form component and the API route so neither can be bypassed.

---

## Forms and validation

- Forms use `react-hook-form` with `zodResolver`.
- The Zod schema in the form component and its mirror in the API route must stay in sync. If you change one, change the other.
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
- Toast notifications use `useToast()` from `components/ui/use-toast.ts`.

---

## File uploads

- Files are stored on the local filesystem under `UPLOAD_DIR` (default `./uploads`).
- The upload route validates MIME type against an allowlist and the file extension against a separate allowlist (to prevent double-extension attacks like `.jpg.php`).
- All file paths are resolved with `path.resolve()` and checked against the upload root with `assertSafePath()` to prevent path traversal.
- `originalName` is sanitised (strip `\r`, `\n`, `"`, `\`) before storing in the database.
- Max upload size: 50 MB.
- In Docker, `uploads/` is a named volume — never bake uploaded files into the image.

---

## Prometheus integration

- `/api/prometheus/sd` — HTTP Service Discovery. Returns assets with hostnames as target groups with `sam_*` labels. If the asset type has a `scrapeTargetTemplate`, it is rendered and its `__labels__` are merged in.
- `/api/prometheus/metrics` — Prometheus text format inventory metrics. No `prom-client` dependency — the format is built as a plain string.
- `/api/assets/by-hostname` — Grafana Infinity datasource lookup. Accepts session cookie OR Bearer token.
- Template syntax: newline-separated `key=value` pairs. Variables: `{hostname_fqdn}`, `{serial}`, `{model}`, `{manufacturer}`, `{fi_number}`, `{vault_<key>}`. Validated server-side via `validateTemplate()` in `lib/scrape-template.ts`.
- Vault client (`lib/vault.ts`) uses native `fetch`. Returns `null` on any error — never throws. Vault errors must not crash the SD endpoint for all targets.

---

## Security rules — do not regress

- All HTTP responses already include security headers (CSP, HSTS, X-Frame-Options, etc.) via `next.config.ts`. Do not remove or weaken them.
- The CSP `frame-src` allows `https://www.openstreetmap.org` for the map embeds — if you add other embeds, add their origin here.
- Never log secrets, passwords, or Vault token values.
- `PROMETHEUS_SD_TOKEN` and `VAULT_TOKEN` must never be returned in API responses.
- Do not add new unauthenticated public routes without explicit discussion.
- Passwords are hashed with bcrypt cost 12. Do not lower the cost factor.
- The `/api/setup` endpoint checks `userCount === 0` before allowing admin creation. Do not remove this guard.
- JWT sessions expire in 8 hours (`maxAge: 8 * 60 * 60`). Do not increase this without discussion.

---

## Docker

- The `Dockerfile` uses a three-stage multi-stage build: `deps → builder → runner`.
- The runner image runs as non-root user `nextjs` (uid 1001). Do not run as root.
- `NEXT_TELEMETRY_DISABLED=1` is set at build time and runtime.
- The standalone output (`next.config.ts`: `output: "standalone"`) is used. The entrypoint is `node server.js`.
- `uploads/` is a named Docker volume — do not add it to the image.
- All secrets come from environment variables. Never hardcode credentials.
- `docker-compose.yml` is the production stack (app + MySQL). `docker-compose.dev.yml` is MySQL-only for local dev.

---

## Environment variables

Key variables (always present):
- `DATABASE_URL` — MySQL connection string
- `NEXTAUTH_SECRET` — JWT signing secret (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` — full public URL, no trailing slash

Optional integrations:
- `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` — Entra ID SSO
- `PROMETHEUS_SD_TOKEN` — Bearer token for `/api/prometheus/*` endpoints
- `VAULT_ADDR` / `VAULT_TOKEN` / `VAULT_KV_VERSION` — HashiCorp Vault

`.env.example` is the canonical reference. Always update it when adding new variables.

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

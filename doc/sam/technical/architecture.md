---
title: "Architecture"
sync_to_confluence: true
---

# Architecture

## Tech Stack

| Layer | Package | Version |
|---|---|---|
| Framework | Next.js | 16.4.2 |
| Language | TypeScript | ~5.9 |
| Runtime | Node.js | 24 LTS |
| React | react | 19.3 |
| ORM | Prisma | 7.10 |
| Database | MySQL | 8.0 |
| Auth | NextAuth | 5.0.0-beta.32 |
| Styling | Tailwind CSS | v4 |
| Validation | Zod | v4 |
| Forms | react-hook-form | v7 |
| i18n | next-intl | v4 |
| Icons | lucide-react | latest |
| UI primitives | hand-written shadcn-style | — |
| Test runner | Vitest | latest |
| Component tests | @testing-library/react | latest |
| DOM environment | jsdom | v29 |

---

## Project Structure

```
SAMproject/
├── app/            # App Router: (auth)/ login pages, (dashboard)/ protected pages, api/ route handlers,
│                   # setup/ first-run wizard, actions/ the locale server action
├── components/     # React components by feature; ui/ holds the hand-written primitives
├── lib/            # Shared code (modules importing next/server are server-only route helpers)
├── i18n/           # next-intl setup: supported locales + per-request config
├── messages/       # Translations: en.json, nl.json
├── prisma/         # schema.prisma (source of truth) + committed migrations
├── scripts/        # Maintenance scripts (backup export, audit purge/forwarding, password reset, data fixes)
├── __tests__/      # Tests mirroring the source layout (lib/, api/, components/)
├── proxy.ts        # NextAuth session guard (replaces middleware.ts)
├── next.config.ts  # Security headers, standalone output, next-intl plugin
└── Dockerfile      # Multi-stage production build
```

The per-module list (what each `lib/` module and `components/` folder owns) is kept in one place: the *Project architecture* section of `AGENTS.md` at the repository root.

---

## Key Architectural Decisions

### Next.js App Router

All pages use the App Router with React Server Components. Protected pages live under `(dashboard)/` — the layout performs the auth check and renders the navigation. Public pages (`(auth)/`, `setup/`) sit outside this layout.

### Route Guard: `proxy.ts`

This project uses Next.js 16, where `middleware.ts` is replaced by `proxy.ts` at the project root. The exported function must be named `proxy` (not default). It handles:

- Redirecting unauthenticated requests to `/login`
- Forcing password change, 2FA setup, and 2FA challenge flows
- Exempting public routes (`/login`, `/setup`, `/api/auth`, `/api/setup`)
- Exempting Prometheus endpoints (they use Bearer token auth)
- Exempting export endpoints (`/api/export/*` — session or Bearer `EXPORT_TOKEN`, checked in the handlers)

> The proxy is a **redirect guard only** — not an authorization boundary. Every API route performs its own auth and role check.

### API Route Conventions

All API handlers follow this pattern:

```
1. await auth() → 401 if no session
2. check role   → 403 if insufficient
3. await params → always async (Next.js 16 requirement)
4. parse body   → Zod validation → 400 on failure
5. prisma query → 409 on P2002 (unique constraint)
6. return NextResponse.json(result)
```

### Async Params

Next.js 16 makes route params a `Promise`. Always await them:

```typescript
// Correct
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

### Validation Strategy

Zod schemas are **mirrored** in both the form component and the API route handler. This prevents bypass via direct API calls. When a schema changes, both copies must be updated together.

Cross-field validation uses `.superRefine()`. Example: hostname → MAC address required.

### Styling

Tailwind CSS v4 reads configuration from `app/globals.css` using `@theme inline { … }` and CSS variables. There is **no** `tailwind.config.ts` file.

Design tokens are CSS custom properties on `:root`. Primary color: `#1e64c8` (UGent blue). Brand yellow: `#ffd200`.

### UI Components

UI primitives in `components/ui/` are hand-written shadcn-style components. Do **not** run `npx shadcn` — it will overwrite with incompatible versions.

### Internationalisation

UI text comes from `next-intl`. `i18n/locales.ts` lists the supported locales (`en`, `nl`; default `en`) and the `NEXT_LOCALE` cookie name; `i18n/request.ts` picks the locale from that cookie per request and loads `messages/<locale>.json`. The message files use nested keys per area (`common`, `assets`, …); components read them with `useTranslations` / `getTranslations`. Add a key to `en.json` and `nl.json` together.

The language switcher in the header calls `setLocale` in `app/actions/locale.ts` — the codebase's only server action, and the one exception to "client code talks to API routes through `apiFetch`". It writes only the locale cookie and revalidates the layout; it touches no data, so it has no auth check.

### Database

Prisma ORM with MySQL 8. Raw SQL is used only for the recursive location-tree CTEs in `lib/locations/path.ts`: ancestor paths, descendant IDs, the deepest-first subtree used by the location delete, and per-location asset totals (for the whole tree, or scoped to the locations a search matched). They are exercised against a real MySQL by `npm run test:integration`.

All of it uses `prisma.$queryRaw` with tagged template literals. Never use string concatenation in SQL.

MySQL returns `COUNT(*)` as `BigInt` — always wrap with `Number(row.count)`.

### File Uploads

Uploads are handled via the native `formData()` API — no `multer`. The upload pipeline:
1. Validates MIME type against an allowlist
2. Validates file extension (separately, to block `.jpg.php` double-extension attacks)
3. Sanitizes `originalName` (strips `\r`, `\n`, `"`, `\`)
4. Resolves storage path with `path.resolve()` + `assertSafePath()` (path traversal protection)
5. Stores on local disk or S3 depending on `STORAGE_DRIVER`

Max upload size: 50 MB.

---

## Testing Architecture

| Tool | Role |
|---|---|
| Vitest | Test runner |
| @testing-library/react | Component rendering + interaction |
| @testing-library/user-event | Realistic browser event simulation |
| jsdom v29 | Browser environment (requires Node 22.12+) |
| @vitest/coverage-v8 | Coverage measurement |

Tests live in `__tests__/` mirroring the source tree.

**Rules:**
- Mock Prisma at module level: `vi.mock("@/lib/prisma", ...)`
- Mock auth: `vi.mock("@/lib/auth", ...)`
- `vi.mock()` calls must be at the top level — they are hoisted above all declarations
- Query by role/label/text — never by CSS class or data-testid
- No snapshot tests
- Coverage threshold: 80% lines/functions/branches/statements

**Auth mock pattern:**

```typescript
const mockAuth = vi.mocked(auth);
mockAuth.mockResolvedValue({ user: { role: "ADMIN" } } as never);
// The "as never" cast is required because next-auth v5's auth() has a
// middleware overload that makes TypeScript reject plain session objects.
```

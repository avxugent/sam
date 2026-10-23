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
| Icons | lucide-react | latest |
| UI primitives | hand-written shadcn-style | — |
| Test runner | Vitest | latest |
| Component tests | @testing-library/react | latest |
| DOM environment | jsdom | v29 |

---

## Project Structure

```
SAMproject/
├── app/                      # Next.js app directory
│   ├── (auth)/               # Unauthenticated pages (login, setup-2fa, …)
│   ├── (dashboard)/          # Authenticated layout (sidebar + header)
│   │   ├── locations/        # Location browser and detail pages
│   │   ├── admin/            # Admin-only pages
│   │   ├── settings/         # User settings
│   │   ├── stock/            # Stock management
│   │   ├── reports/          # Report builder
│   │   └── …
│   ├── api/                  # REST API route handlers
│   │   ├── assets/
│   │   ├── locations/
│   │   ├── prometheus/
│   │   ├── grafana/
│   │   └── …
│   ├── setup/                # First-run wizard (no auth)
│   ├── globals.css           # Tailwind v4 config + CSS variables
│   └── layout.tsx            # Root layout
├── components/
│   ├── ui/                   # Reusable UI primitives (Button, Dialog, Input, …)
│   ├── layout/               # Sidebar, Header, mobile nav
│   ├── assets/               # Asset form, table, detail
│   ├── locations/            # Location form, detail, map
│   ├── attachments/          # Attachment gallery
│   ├── auth/                 # Login, 2FA, password reset forms
│   ├── settings/             # User/type/manufacturer management
│   ├── stock/                # Stock management
│   ├── reports/              # Report builder/viewer
│   └── import/               # CSV import wizard
├── lib/                      # Shared server utilities
│   ├── auth.ts               # NextAuth config + ssoEnabled flag
│   ├── prisma.ts             # PrismaClient singleton
│   ├── audit.ts              # Audit log writer + syslog forwarder
│   ├── permissions.ts        # Role helper functions
│   ├── vault.ts              # HashiCorp Vault client
│   ├── scrape-template.ts    # Prometheus label template renderer
│   ├── storage.ts            # File upload abstraction (local/S3)
│   ├── location-path.ts      # Recursive CTE ancestor resolver
│   ├── report-engine.ts      # Report query executor
│   ├── email.ts              # SMTP client
│   ├── jira.ts               # JIRA API client
│   ├── syslog.ts             # RFC 5424 syslog client
│   ├── totp.ts               # TOTP helper (speakeasy)
│   ├── rate-limit.ts         # In-memory rate limiter
│   └── utils.ts              # cn() utility (clsx + tailwind-merge)
├── prisma/
│   └── schema.prisma         # MySQL schema (source of truth)
├── __tests__/                # Test files mirroring source structure
│   ├── lib/
│   ├── api/
│   └── components/
├── scripts/                  # Maintenance scripts (cron, export, audit forwarding)
├── proxy.ts                  # NextAuth session guard (replaces middleware.ts)
├── next.config.ts            # Security headers, standalone output
├── docker-compose.yml        # Production stack
├── docker-compose.dev.yml    # Dev MySQL only
└── Dockerfile                # Multi-stage production build
```

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

### Database

Prisma ORM with MySQL 8. Raw SQL is only used in two places:
1. Recursive CTE for location ancestor path resolution (`lib/location-path.ts`)
2. `getAllDescendantIds` for cascading location queries

Both use `prisma.$queryRaw` with tagged template literals. Never use string concatenation in SQL.

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

---
title: "Getting Started – Local Development"
sync_to_confluence: true
---

# Getting Started – Local Development

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 26 | Pinned via `.nvmrc` — run `nvm use` |
| npm | bundled with Node 26 | |
| Docker | any recent | For local MySQL |
| Git | any | |

> **Node version matters.** Tests use jsdom v29 which requires Node 22.12+. `ERR_REQUIRE_ESM` on `html-encoding-sniffer` means you're on the wrong version — run `nvm use`.

---

## 1. Clone and install

```bash
git clone <repo-url>
cd SAMproject
nvm use          # switches to Node 26 per .nvmrc
npm install
```

---

## 2. Start MySQL

A `docker-compose.dev.yml` starts MySQL only (no app container):

```bash
docker compose -f docker-compose.dev.yml up -d
```

Default dev credentials (hardcoded in `docker-compose.dev.yml`):

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `3306` |
| Database | `samdb` |
| User | `sam` |
| Password | `sampassword` |
| Root password | `rootpassword` |

---

## 3. Configure environment

```bash
cp .env.example .env
```

Minimum required changes in `.env`:

```dotenv
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="samdb"
DB_USER="sam"
DB_PASSWORD="sampassword"
NEXTAUTH_SECRET="any-random-string-for-local-dev"
NEXTAUTH_URL="http://localhost:3000"
```

See [Configuration](configuration.md) for all available variables.

---

## 4. Apply database schema

```bash
npm run db:migrate:deploy
```

This runs `prisma migrate deploy` — applies every committed migration from `prisma/migrations/` in order, bringing a fresh database up to date. Once you're making your own schema changes, use `npm run db:migrate` instead (creates a new migration from your `schema.prisma` edits and applies it) — see [Database → Database Scripts](database.md#database-scripts) for the full workflow.

---

## 5. Start the dev server

```bash
npm run dev
```

The app starts on [http://localhost:3000](http://localhost:3000).

---

## 6. First-run setup

On first visit, the app redirects to `/setup`. This wizard creates the first admin account. The `/setup` route is only accessible when zero users exist in the database.

---

## Useful scripts

```bash
npm run dev              # start dev server with hot reload
npm test                 # run test suite (must pass before committing)
npm run test:watch       # watch mode for TDD
npm run test:coverage    # run tests + enforce 80% coverage threshold
npm run test:ui          # open Vitest browser UI
npm run test:integration # opt-in raw SQL tests against the dev MySQL (needs DB_* env)
npm run db:migrate       # create + apply a migration from schema.prisma edits (dev)
npm run db:migrate:deploy # apply committed, pending migrations only (prod / fresh DB)
npm run db:push          # push schema straight to DB, no migration file (prototyping only)
npm run db:generate      # regenerate Prisma client after schema change
npm run db:studio        # open Prisma Studio (visual DB browser at localhost:5555)
npm run lint             # ESLint
npm run build            # production build
```

---

## Running tests

```bash
npm test
```

All tests must pass before pushing. The test suite covers:
- `lib/` — unit tests for all utility functions
- `app/api/` — mocked route handler tests (auth, validation, happy path)
- `components/` — React component tests via `@testing-library/react`

Coverage is enforced at **80% minimum** across lines, functions, branches, and statements.

```bash
npm run test:coverage    # fails build if below 80%
```

See [Architecture](architecture.md) for test conventions.

---

## Continuous integration and security

Workflows live in `.github/workflows/`; each has a status badge in the README.

| Workflow | Runs on | What it checks |
|---|---|---|
| `ci.yml` | push / PR to `main` | `npm audit`, type-check (app and scripts), ESLint, unit tests with the 80% coverage gate, integration tests against MySQL |
| `codeql.yml` | push / PR to `main`, weekly | CodeQL static analysis (`security-extended`) of the TypeScript code; results in the Security tab |
| `dependency-review.yml` | PRs touching a manifest or lockfile | Blocks new or bumped dependencies with a known vulnerability of moderate severity or higher |
| `docker-security.yml` | Docker-related changes, weekly | Hadolint on the Dockerfile (errors fail, warnings are shown) and a Trivy scan of the built image (fixable HIGH / CRITICAL vulnerabilities fail) |
| `secret-scan.yml` | push / PR to `main` | Gitleaks over the whole git history; `.gitleaks.toml` allowlists the fake secrets in `__tests__/` |
| `actionlint.yml` | changes to workflow files | Lints the workflow files |
| `pr-title.yml` | PRs | The title must be a conventional commit subject (`feat:`, `fix(scope):`, `build(deps):`, …) |
| `docker-build.yml` | release tags `v*.*.*`, manual | Builds and pushes the image to GHCR and Docker Hub |
| `confluence-publish.yml` | changes to `doc/` | Publishes the documentation to Confluence |

### Dependabot

`.github/dependabot.yml` opens weekly (Monday) PRs for npm, GitHub Actions, the Docker base image and the `docker-compose` images:

- npm: minor and patch updates arrive as one PR, majors one by one. `scripts/` is locked to the root lockfile's versions (`__tests__/scripts/manifest.test.ts`), so the packages both manifests share (`prisma`, `@prisma/*`, `zod`, `tsx`, `bcryptjs`, `node-html-parser`, `@aws-sdk/client-s3`) are bumped together in one PR across `/` and `/scripts`. If that test fails on a Dependabot PR, bring `scripts/package.json` and `scripts/package-lock.json` in line with the root lockfile.
- Docker: Node and MySQL major versions are never proposed. A Node major is adopted by hand, in `.nvmrc`, `ci.yml` and the Dockerfile together.
- PR titles follow the convention above (`build(deps): …`, `ci(deps): …`).

### Running the checks locally

```bash
npx tsc --noEmit && npm run lint && npm run test:coverage   # what ci.yml runs
gitleaks git . --redact                                    # secret scan (install gitleaks)
actionlint                                                 # workflow lint (install actionlint)
hadolint Dockerfile                                        # Dockerfile lint (install hadolint)
```

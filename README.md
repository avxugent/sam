# SAM – Simple Asset Management

A modern web application for managing AV hardware assets across physical rooms and facilities.

## Features

- **Multi-tier location tree** — define Campus → Building → Floor → Room (unlimited depth)
- **Asset management** — track projectors, monitors, PCs and any AV hardware with full details
- **Asset fields** — Type, Manufacturer, Model (with autocomplete), Serial Number, MAC Addresses, Hostname, Installation Date, Invoice Number/Date, Notes, and unlimited custom key/value fields
- **File attachments** — attach photos and documents to both locations and assets
- **Editable lookup lists** — manage Asset Types and Manufacturers from the settings panel
- **Role-based access** — Admin / Editor / Viewer roles
- **First-run wizard** — creates the first admin account on initial setup

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Prisma ORM** + **MySQL 8**
- **NextAuth.js v5** (JWT-based sessions)
- **Tailwind CSS** + shadcn/ui components
- **React Hook Form** + Zod validation
- Local filesystem for file uploads

## Quick Start

### 1. Start MySQL

```bash
docker compose up -d
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if you need to change DB credentials or secrets
```

### 3. Run database migrations

```bash
npm run db:push
# or for a proper migration history:
npm run db:migrate
```

### 4. Start the development server

```bash
npm run dev
```

### 5. Open the app

Visit [http://localhost:3000](http://localhost:3000) — you will be redirected to the setup wizard to create the first admin account.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | `mysql://sam:sampassword@localhost:3306/samdb` |
| `NEXTAUTH_SECRET` | Random secret for JWT signing | **change this in production** |
| `NEXTAUTH_URL` | Full URL of the app | `http://localhost:3000` |
| `UPLOAD_DIR` | Directory for file uploads | `./uploads` |

## User Roles

| Role | Permissions |
|---|---|
| **Admin** | Full access: manage users, settings, locations, assets |
| **Editor** | Create/edit/delete locations and assets, upload files |
| **Viewer** | Read-only access to all data |

## Database Scripts

```bash
npm run db:push        # Push schema changes (no migration history)
npm run db:migrate     # Run migrations (recommended for production)
npm run db:generate    # Regenerate Prisma client after schema changes
npm run db:studio      # Open Prisma Studio (visual DB browser)
```

## Production Deployment

1. Set `NEXTAUTH_SECRET` to a long random string
2. Set `NEXTAUTH_URL` to your production URL
3. Point `DATABASE_URL` to your production MySQL server
4. Build: `npm run build`
5. Start: `npm start`
6. Make sure the `uploads/` directory is writable and persisted

## Project Structure

```
app/
  (auth)/login/          Login page
  (dashboard)/           Protected layout with sidebar
    locations/[id]/      Location detail (assets, sub-locations, attachments)
    locations/[id]/assets/[assetId]/  Asset detail
    settings/            Users, Asset Types, Manufacturers
  api/                   REST API routes
  setup/                 First-run setup wizard
components/
  layout/                Sidebar + Header
  locations/             Location form dialog, detail client
  assets/                Asset table, form dialog, detail client
  attachments/           Attachment gallery with upload
  settings/              User management, lookup list manager
  ui/                    shadcn/ui component library
lib/
  prisma.ts              Prisma client singleton
  auth.ts                NextAuth configuration
  permissions.ts         Role helpers
prisma/
  schema.prisma          Database schema
uploads/                 Uploaded files (gitignored)
docker-compose.yml       MySQL 8 for local development
```

---
title: "SAM - Deployment"
sync_to_confluence: true
---

# Deployment

SAM is deployed as a Docker container with MySQL as a separate service. The production stack is defined in `docker-compose.yml`.

---

## Architecture

```
┌─────────────────────────────┐     ┌──────────────────────┐
│  app container              │     │  db container        │
│  node .next/standalone/     │────▶│  MySQL 8.0           │
│  server.js                  │     │                      │
│  port 3000                  │     │  volume: sam-mysql-  │
│                             │     │  data                │
│  volume: sam-uploads        │     └──────────────────────┘
└─────────────────────────────┘
```

Named Docker volumes:
- `sam-uploads` — uploaded files (never bake into image)
- `sam-mysql-data` — MySQL data directory

---

## Production Deployment Steps

### 1. Configure environment

```bash
cp .env.example .env
```

Mandatory variables:

| Variable | Description |
|---|---|
| `DB_HOST` | `db` (the docker-compose service name) |
| `DB_PORT` | `3306` |
| `DB_NAME` | `samdb` |
| `DB_USER` | `sam` |
| `DB_PASSWORD` | Strong password |
| `DB_SSL` | `false` (both containers on the same Docker network) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Full public URL, e.g. `https://sam.example.com` |
| `MYSQL_ROOT_PASSWORD` | Strong password (MySQL container only) |

See [Configuration](configuration.md) for all variables.

### 2. Build and start

```bash
docker compose up -d --build
```

This builds the app image (multi-stage, ~180 MB) and starts both containers.

### 3. Push schema (first time only)

```bash
docker compose exec app npx prisma db push
```

For subsequent schema changes use:

```bash
docker compose exec app npx prisma migrate deploy
```

### 4. Access the app

Visit the URL set in `NEXTAUTH_URL`. The setup wizard appears on first run.

---

## Dockerfile

Four-stage multi-stage build:

| Stage | Purpose |
|---|---|
| `deps` | Install npm dependencies |
| `prisma-cli` | Install Prisma CLI |
| `builder` | Build the Next.js app (`next build`) |
| `runner` | Final image — copies standalone output only |

The entrypoint is `node .next/standalone/server.js` (enabled by `output: "standalone"` in `next.config.ts`).

The runner image runs as non-root user `nextjs` (uid 1001). Never run as root.

`NEXT_TELEMETRY_DISABLED=1` is set at both build time and runtime.

---

## Updates

```bash
git pull
docker compose up -d --build
docker compose exec app npx prisma migrate deploy   # if schema changed
```

---

## Backups

### Database

```bash
docker compose exec db mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" samdb > backup-$(date +%Y%m%d).sql
```

### Uploads volume

```bash
docker run --rm -v sam-uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

### CSV export

```bash
# Via API (requires EXPORT_TOKEN or admin session)
curl -H "Authorization: Bearer ${EXPORT_TOKEN}" \
  https://sam.example.com/api/export/csv > assets-$(date +%Y%m%d).csv
```

Automate with `scripts/export-backup.mjs` (writes to local disk or S3 depending on `STORAGE_DRIVER`).

---

## Reverting

1. Stop the app: `docker compose stop app`
2. Restore database from backup
3. Check out previous version: `git checkout <tag>`
4. Rebuild: `docker compose up -d --build`

Prisma migrations are tracked in the database (`_prisma_migrations` table). Downgrading schema requires manual SQL — there are no automatic rollback scripts.

---

## Nomad Deployment

A Nomad job spec is provided at `sam.nomad` for HashiCorp Nomad clusters. It expects:
- Docker driver
- Nomad variables or Vault integration for secrets
- A MySQL service accessible from the Nomad client nodes

Configure the job spec variables for your cluster, then:

```bash
nomad job run sam.nomad
```

---

## Security Checklist

- [ ] `NEXTAUTH_SECRET` generated with `openssl rand -base64 32` — unique per deployment
- [ ] `DB_PASSWORD` is a strong, unique password
- [ ] `DB_SSL=true` when database is on a separate host
- [ ] MySQL port (3306) is not exposed in production (`docker-compose.yml` DB service has no `ports` mapping — verify this before deploying)
- [ ] App runs behind a reverse proxy (nginx, Caddy, Traefik) with TLS termination
- [ ] `NEXTAUTH_URL` set to the HTTPS URL
- [ ] `uploads/` on a named volume — not baked into the image
- [ ] All secrets come from environment — nothing hardcoded

---

## Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name sam.example.com;

    ssl_certificate     /etc/ssl/certs/sam.crt;
    ssl_certificate_key /etc/ssl/private/sam.key;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 55M;  # allow up to 50 MB uploads + headroom
    }
}
```

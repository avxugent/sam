# SAM — Nomad Deployment

## Prerequisites

1. A Nomad cluster with the Docker driver enabled
2. HashiCorp Vault integrated with Nomad (`vault { address = "..." }` in Nomad agent config)
3. A MySQL 8 instance (deploy separately or use a managed service)
4. A Docker registry containing the SAM image

---

## Step 1 — Build and push the Docker image

```bash
docker build -t your-registry/sam:latest .
docker push your-registry/sam:latest
```

---

## Step 2 — Create Vault secrets

```bash
# Core application config
vault kv put secret/sam/config \
  database_url="mysql://sam:CHANGE_ME@mysql-host:3306/samdb" \
  nextauth_secret="$(openssl rand -base64 32)" \
  prometheus_sd_token="$(openssl rand -base64 32)" \
  vault_addr="https://vault.example.com" \
  vault_token="s.CHANGE_ME"

# Microsoft Entra ID SSO (skip if not using SSO)
vault kv put secret/sam/entra \
  client_id="YOUR_AZURE_APP_CLIENT_ID" \
  client_secret="YOUR_AZURE_APP_CLIENT_SECRET" \
  issuer="https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0"
```

---

## Step 3 — Apply the Vault policy

```bash
vault policy write sam-app nomad/vault-policy-sam-app.hcl
```

---

## Step 4 — Configure the Nomad host volume (for uploads)

Add this to the Nomad **client** configuration on each node that will run SAM:

```hcl
host_volume "sam-uploads" {
  path      = "/opt/nomad/volumes/sam-uploads"
  read_only = false
}
```

Create the directory:
```bash
mkdir -p /opt/nomad/volumes/sam-uploads
```

---

## Step 5 — Edit and deploy the job

1. Open `sam.nomad` and update:
   - `image = "your-registry/sam:latest"` → your actual image reference
   - `NEXTAUTH_URL` → your public hostname
   - Traefik tags → your routing rules (or remove if using a different load balancer)
   - `datacenters` → your Nomad datacenter name

2. Deploy:
```bash
nomad job run sam.nomad
```

3. Check status:
```bash
nomad job status sam
nomad alloc logs <alloc-id>
```

---

## Environment variable reference

| Variable | Source | Description |
|---|---|---|
| `DATABASE_URL` | Vault `sam/config` | MySQL connection string |
| `NEXTAUTH_SECRET` | Vault `sam/config` | JWT signing secret |
| `NEXTAUTH_URL` | Job spec `env` block | Public app URL |
| `UPLOAD_DIR` | Job spec `env` block | `/app/uploads` (fixed) |
| `PROMETHEUS_SD_TOKEN` | Vault `sam/config` | Bearer token for Prometheus endpoints |
| `VAULT_ADDR` | Vault `sam/config` | Vault URL for per-asset credential lookups |
| `VAULT_TOKEN` | Vault `sam/config` | Token for per-asset credential lookups |
| `VAULT_KV_VERSION` | Job spec `env` block | `v2` (fixed) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Vault `sam/entra` | Azure client ID (optional) |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Vault `sam/entra` | Azure client secret (optional) |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Vault `sam/entra` | Azure issuer URL (optional) |

---

## First-time database setup

The `migrate` prestart task in `sam.nomad` runs `prisma migrate deploy` automatically before every deploy, applying any pending committed migrations from `prisma/migrations/` — nothing to run manually.

To run it by hand instead (e.g. troubleshooting):

```bash
# Find the allocation ID
nomad job status sam

nomad alloc exec <alloc-id> npx prisma migrate deploy
```

See `doc/sam/technical/database.md#database-scripts` for how schema changes are shipped (committed migration files, not a live diff) and why — `db push`/an ad-hoc diff aborts the whole deploy the moment it hits an unsafe step, e.g. a required column added to a table that already has rows.

---

## Updating the application

```bash
docker build -t your-registry/sam:latest .
docker push your-registry/sam:latest
nomad job run sam.nomad   # triggers a rolling restart
```

To force a restart without a new image:

```bash
nomad job restart sam
```

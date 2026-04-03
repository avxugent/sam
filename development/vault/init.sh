#!/bin/sh
# Vault initialisation script — runs once via the vault-init container.
#
# Sets up:
#   - AppRole auth method with a sam-dev role
#   - A read policy for secret/*
#   - Sample KV v2 secrets for local development and testing
#
# The generated role_id and secret_id are printed to stdout.
# To retrieve them after the fact:
#   docker compose logs vault-init
#
# To use AppRole instead of the root token in the app service:
#   1. Copy the role_id and secret_id from the logs above.
#   2. In docker-compose.yml, set VAULT_ROLE_ID and VAULT_SECRET_ID on the app service.
#   3. Set VAULT_TOKEN to an empty string (or remove it entirely).
#   4. Restart: docker compose up app

set -e

echo "[vault-init] Waiting for Vault to accept connections..."
until vault status > /dev/null 2>&1; do
  sleep 1
done
echo "[vault-init] Vault is ready."

# ── Auth: AppRole ─────────────────────────────────────────────────────────────

echo "[vault-init] Enabling AppRole auth method..."
# Guard against re-runs — enable is idempotent with this check
if vault auth list | grep -q "approle/"; then
  echo "[vault-init] AppRole already enabled, skipping."
else
  vault auth enable approle
fi

# ── Policy ───────────────────────────────────────────────────────────────────

echo "[vault-init] Writing sam-dev policy..."
vault policy write sam-dev - <<'EOF'
# Allow SAM to read any secret under the secret/ KV mount
path "secret/*" {
  capabilities = ["read", "list"]
}
EOF

# ── AppRole role ─────────────────────────────────────────────────────────────

echo "[vault-init] Configuring sam-dev AppRole role..."
vault write auth/approle/role/sam-dev \
  policies=sam-dev \
  secret_id_ttl=0 \
  token_ttl=1h \
  token_max_ttl=4h

ROLE_ID=$(vault read -field=role_id auth/approle/role/sam-dev/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/sam-dev/secret-id)

echo ""
echo "================================================================"
echo "  AppRole credentials (add to app service env to test AppRole)  "
echo "================================================================"
echo "  VAULT_ROLE_ID   = ${ROLE_ID}"
echo "  VAULT_SECRET_ID = ${SECRET_ID}"
echo "================================================================"
echo ""

# ── Sample secrets ────────────────────────────────────────────────────────────
# These match the paths you would enter in an asset's Vault Path field.
# The keys (username, password, snmp_community, …) can be referenced in
# scrape target templates as {vault_username}, {vault_password}, etc.

echo "[vault-init] Writing sample KV secrets..."

vault kv put secret/av/device1 \
  username=monitor \
  password=secret123

vault kv put secret/av/device2 \
  username=admin \
  password=prom456

vault kv put secret/network/switch1 \
  snmp_community=public \
  read_only_key=abc123

echo "[vault-init] Done. Secrets written:"
echo "  secret/av/device1     — username, password"
echo "  secret/av/device2     — username, password"
echo "  secret/network/switch1 — snmp_community, read_only_key"

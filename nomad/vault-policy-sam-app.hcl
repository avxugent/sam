# Vault policy for the SAM Nomad job.
# Apply with:
#   vault policy write sam-app nomad/vault-policy-sam-app.hcl

# Core application secrets (DATABASE_URL, NEXTAUTH_SECRET, tokens, etc.)
path "secret/data/sam/config" {
  capabilities = ["read"]
}

# Microsoft Entra ID SSO credentials (optional)
path "secret/data/sam/entra" {
  capabilities = ["read"]
}

# SAM also reads per-asset credentials at deploy-time for Prometheus SD.
# If all asset secrets live under a common prefix, grant read to that prefix.
# Adjust the path to match your secret layout.
path "secret/data/av/*" {
  capabilities = ["read"]
}

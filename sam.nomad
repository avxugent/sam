// SAM – Simple Asset Management
// Nomad job specification for production deployment.
//
// Prerequisites:
//   - A Docker registry hosting the SAM image (built from the Dockerfile)
//   - A MySQL 8 instance reachable from the Nomad cluster
//     (or deploy the "sam-db" job separately, see below)
//   - HashiCorp Vault with:
//       - KV v2 secret at secret/data/sam/config  (see required keys below)
//       - A Vault policy "sam-app" with read access to that path
//       - The Nomad cluster configured with vault { address = "..." }
//
// Required Vault secret keys at  secret/data/sam/config :
//   db_host               MySQL hostname (e.g. "db.internal")
//   db_port               MySQL port (e.g. "3306")
//   db_name               Database name (e.g. "samdb")
//   db_user               Database username (e.g. "sam")
//   db_password           Database password for the above user
//   db_ssl                "true" to require TLS, "false" otherwise
//   nextauth_secret       output of: openssl rand -base64 32
//   prometheus_sd_token   output of: openssl rand -base64 32  (leave blank to disable)
//   vault_addr            https://vault.example.com  (SAM's own Vault reads for asset creds)
//   vault_token           a Vault token for SAM's per-asset secret lookups
//
// Optional Vault secret keys at  secret/data/sam/entra  (omit path if SSO not needed):
//   client_id             Azure App Registration client ID
//   client_secret         Azure App Registration client secret
//   issuer                https://login.microsoftonline.com/<tenant-id>/v2.0

job "sam" {
  datacenters = ["dc1"]   // adjust to your datacenter name(s)
  type        = "service"

  // ── Update strategy ──────────────────────────────────────────────────────
  update {
    max_parallel      = 1
    min_healthy_time  = "30s"
    healthy_deadline  = "5m"
    progress_deadline = "10m"
    auto_revert       = true
    canary            = 0
  }

  // ── Application group ─────────────────────────────────────────────────────
  group "app" {
    count = 1

    // Persist uploaded files across restarts and redeployments
    volume "uploads" {
      type      = "host"          // use "csi" for shared storage across nodes
      read_only = false
      source    = "sam-uploads"   // must be declared in the Nomad client config
    }

    network {
      port "http" {
        to = 3000
        // Remove 'static' to let Nomad pick a dynamic port (use with a load balancer)
        // static = 3000
      }
    }

    service {
      name     = "sam"
      port     = "http"
      provider = "consul"   // or "nomad" if not using Consul

      tags = [
        "traefik.enable=true",
        "traefik.http.routers.sam.rule=Host(`sam.example.com`)",
        "traefik.http.routers.sam.entrypoints=websecure",
        "traefik.http.routers.sam.tls=true",
      ]

      check {
        type     = "http"
        path     = "/api/setup"
        interval = "30s"
        timeout  = "5s"
      }
    }

    // ── Vault integration ───────────────────────────────────────────────────
    vault {
      policies    = ["sam-app"]
      change_mode = "restart"
    }

    // ── Application task ────────────────────────────────────────────────────
    task "sam" {
      driver = "docker"

      config {
        image = "your-registry/sam:latest"    // replace with your image reference
        ports = ["http"]

        // Mount the uploads volume into the container
        mount {
          type   = "volume"
          target = "/app/uploads"
          source = "uploads"
        }
      }

      // ── Non-secret environment variables ─────────────────────────────────
      // These are safe to set directly in the job spec.
      env {
        NEXTAUTH_URL     = "https://sam.example.com"   // public URL of this deployment
        UPLOAD_DIR       = "/app/uploads"
        VAULT_KV_VERSION = "v2"
        NODE_ENV         = "production"
        PORT             = "3000"
        HOSTNAME         = "0.0.0.0"
      }

      // ── Secret environment variables from Vault ───────────────────────────
      // Nomad renders these templates using its Vault integration and injects
      // the resulting KEY=VALUE pairs as environment variables (env = true).

      template {
        data = <<EOH
{{- with secret "secret/data/sam/config" -}}
DB_HOST="{{ .Data.data.db_host }}"
DB_PORT="{{ .Data.data.db_port }}"
DB_NAME="{{ .Data.data.db_name }}"
DB_USER="{{ .Data.data.db_user }}"
DB_PASSWORD="{{ .Data.data.db_password }}"
DB_SSL="{{ .Data.data.db_ssl }}"
NEXTAUTH_SECRET="{{ .Data.data.nextauth_secret }}"
PROMETHEUS_SD_TOKEN="{{ .Data.data.prometheus_sd_token }}"
VAULT_ADDR="{{ .Data.data.vault_addr }}"
VAULT_TOKEN="{{ .Data.data.vault_token }}"
{{- end }}
EOH
        destination = "secrets/sam.env"
        env         = true
        change_mode = "restart"
      }

      // Microsoft Entra ID SSO (optional — omit this template block if not using SSO)
      template {
        data = <<EOH
{{- with secret "secret/data/sam/entra" -}}
AUTH_MICROSOFT_ENTRA_ID_ID="{{ .Data.data.client_id }}"
AUTH_MICROSOFT_ENTRA_ID_SECRET="{{ .Data.data.client_secret }}"
AUTH_MICROSOFT_ENTRA_ID_ISSUER="{{ .Data.data.issuer }}"
{{- end }}
EOH
        destination = "secrets/sam-entra.env"
        env         = true
        change_mode = "restart"
      }

      // ── Resource allocation ───────────────────────────────────────────────
      resources {
        cpu    = 500   // MHz
        memory = 512   // MB — increase if running large imports
      }

      // ── Nomad Actions ─────────────────────────────────────────────────────
      // Run via: nomad alloc exec -task sam <alloc-id> <command>
      // Or trigger from the Nomad UI under the allocation's "Actions" tab.
      //
      // Scripts run inside the production container; environment variables
      // (DB_HOST, DB_PASSWORD, etc.) are already injected by the Vault
      // templates above, so no .env file is needed.

      // Sync location names, addresses, and photos from lokalen.ugent.be.
      // Runs for all locations that have a FI number.
      action "sync-lokalen-dry-run" {
        command = "/usr/local/bin/node"
        args    = ["scripts/sync-lokalen.mjs", "--dry-run", "--skip-images"]
      }

      action "sync-lokalen" {
        command = "/usr/local/bin/node"
        args    = ["scripts/sync-lokalen.mjs"]
      }

      // Sync metadata only (name + address) without downloading photos.
      action "sync-lokalen-metadata-only" {
        command = "/usr/local/bin/node"
        args    = ["scripts/sync-lokalen.mjs", "--skip-images"]
      }

      // Add a portal link attachment to every location with a FI number.
      action "add-location-links-dry-run" {
        command = "/usr/local/bin/node"
        args    = ["scripts/add-location-links.mjs", "--dry-run"]
      }

      action "add-location-links" {
        command = "/usr/local/bin/node"
        args    = ["scripts/add-location-links.mjs"]
      }

      // Export a full CSV backup of all asset data.
      // Writes to the configured S3 bucket or the local exports/ directory.
      action "export-backup" {
        command = "/usr/local/bin/node"
        args    = ["scripts/export-backup.mjs"]
      }

      action "export-backup-dry-run" {
        command = "/usr/local/bin/node"
        args    = ["scripts/export-backup.mjs", "--dry-run"]
      }

      // Forward pending audit log entries to the rsyslog server.
      action "forward-audit" {
        command = "/usr/local/bin/node"
        args    = ["scripts/forward-audit.mjs"]
      }

      // DESTRUCTIVE: wipe all locations and assets for a clean re-import.
      // Preserves users, asset types, and manufacturers.
      // Run the dry-run first and verify the row counts before applying.
      action "clear-import-data-dry-run" {
        command = "/usr/local/bin/node"
        args    = ["scripts/clear-import-data.mjs", "--dry-run"]
      }

      action "clear-import-data-DESTRUCTIVE" {
        command = "/usr/local/bin/node"
        args    = ["scripts/clear-import-data.mjs", "--force"]
      }

      // ── Lifecycle: run db:push before the app starts ──────────────────────
      // Uncomment this block to automatically apply Prisma schema migrations
      // on every deploy. Safe for db push (idempotent); use with care for
      // migrate deploy in long-running production environments.
      //
      // lifecycle {
      //   hook    = "prestart"
      //   sidecar = false
      // }
      // ... (define as a separate "migrate" task — see note below)
    }

    // ── Optional: schema migration task ──────────────────────────────────────
    // Runs `prisma db push` once before the app container starts.
    // Remove if you prefer to run migrations manually.
    task "migrate" {
      driver = "docker"

      lifecycle {
        hook    = "prestart"
        sidecar = false
      }

      config {
        image   = "your-registry/sam:latest"
        command = "npx"
        args    = ["prisma", "db", "push", "--skip-generate"]
      }

      // Needs the DB_* vars to connect
      template {
        data = <<EOH
{{- with secret "secret/data/sam/config" -}}
DB_HOST="{{ .Data.data.db_host }}"
DB_PORT="{{ .Data.data.db_port }}"
DB_NAME="{{ .Data.data.db_name }}"
DB_USER="{{ .Data.data.db_user }}"
DB_PASSWORD="{{ .Data.data.db_password }}"
DB_SSL="{{ .Data.data.db_ssl }}"
{{- end }}
EOH
        destination = "secrets/migrate.env"
        env         = true
      }

      vault {
        policies = ["sam-app"]
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}

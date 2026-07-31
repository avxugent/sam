---
title: "SAM – Simple Asset Management"
confluence_short_name: "SAM"
sync_to_confluence: true
---

# SAM – Simple Asset Management

SAM is a self-hosted web application for managing AV hardware assets across physical rooms and facilities at Ghent University.

## Documentation

| Page | Description |
|---|---|
| [Getting Started](getting-started.md) | Local development setup and first run |
| [Architecture](architecture.md) | Tech stack, project structure, key design decisions |
| [Database](database.md) | Schema, models, and data relationships |
| [Authentication & Roles](authentication.md) | Session auth, SSO, 2FA, role-based access |
| [API Reference](api-reference.md) | All REST API endpoints |
| [Configuration](configuration.md) | Environment variables reference |
| [Deployment](deployment.md) | Docker production deployment |
| [Integrations](integrations.md) | Prometheus, Grafana, Vault, JIRA, S3, Syslog |

## Feature Overview

- **Location tree** — unlimited depth (Campus → Building → Floor → Room → …)
- **Asset management** — type, manufacturer, model, serial, MAC, hostname, custom fields
- **File attachments** — photos and documents on locations and assets
- **Cover images** — hero photo per location
- **Map & address** — OpenStreetMap geocoding (no API key required)
- **CSV import/export** — bulk import from legacy spreadsheet exports
- **Work logs** — maintenance history with optional JIRA issue linking
- **Stock management** — pre-deployment inventory with one-click asset deployment
- **Reports** — custom query builder with CSV export
- **Audit log** — every create/update/delete recorded with user, IP, and diff
- **Roles** — Admin / Editor / Viewer
- **SSO** — Microsoft Entra ID (Azure AD) alongside local credentials
- **2FA** — TOTP-based two-factor authentication (optional per user, enforceable)
- **Prometheus integration** — HTTP Service Discovery + inventory metrics
- **Vault integration** — per-device credential injection into Prometheus scrape targets

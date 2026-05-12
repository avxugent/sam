---
title: "SAM – Simple Asset Management"
sync_to_confluence: true
confluence_short_name: "SAM"
---

# SAM – Simple Asset Management

SAM is a self-hosted web application for managing AV hardware assets across physical rooms and facilities at Ghent University.

## Documentation sections

| Section | Description |
|---|---|
| User Guide | How to use the application — for end users |
| Technical Documentation | Architecture, API, deployment — for developers and administrators |

## Feature Overview

- **Location tree** — unlimited depth (Campus → Building → Floor → Room → …)
- **Asset management** — type, manufacturer, model, serial, MAC, hostname, custom fields
- **File attachments** — photos and documents on locations and assets
- **Work logs** — maintenance history with optional JIRA issue linking
- **Stock management** — pre-deployment inventory with one-click asset deployment
- **Reports** — custom query builder with CSV export
- **Audit log** — every create/update/delete recorded with user, IP, and diff
- **Roles** — Admin / Editor / Viewer
- **SSO** — Microsoft Entra ID (Azure AD) alongside local credentials
- **2FA** — TOTP-based two-factor authentication

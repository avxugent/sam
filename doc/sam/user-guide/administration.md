---
title: "Administration"
sync_to_confluence: true
---

# Administration

Administration features are available to **Admin** users only. Access them via the **Administration** menu in the top navigation bar.

---

## User Management

**Administration → Users**

### Adding a user

1. Click **Add user**.
2. Enter name, email address, password, and role.
3. Optionally check:
   - **Must change password on next login** — forces the user to set a new password at first sign-in
   - **Two-factor authentication required** — forces the user to set up 2FA before accessing the app
4. Click **Create**.

### Editing a user

Click the **pencil icon** on a user row to change their name, email, role, or security settings. To reset a password, enter a new one in the password field.

SSO users (signed in via Microsoft) cannot have their password changed through SAM.

### Deleting a user

Click the **trash icon** on a user row and confirm. Deleted users' audit log entries are retained.

### SSO users

When Microsoft Entra ID SSO is configured, users who sign in via Microsoft are auto-provisioned with the **Viewer** role. Promote them here as needed.

---

## Asset Types

**Administration → Asset Types**

Asset types categorise assets (Projector, Display, Audio Processor, etc.).

- **Create** — click **Add type**, enter a name.
- **Edit** — click the pencil icon to rename or configure the Prometheus scrape template.
- **Delete** — only possible if no assets of that type exist.
- **Maintenance presets** — expand a type to define reusable maintenance task descriptions for work logs.
- **Hostname format** — expand a type and set an optional regular expression under **Hostname format (regex)**. When set, hostnames entered for assets of this type must match it (checked case-insensitively); leave it empty to fall back to the generic domain-name check. Hostnames are always globally unique across every asset, regardless of type or status.

---

## Manufacturers

**Administration → Manufacturers**

Manufacturer names used across all assets.

- **Create / Edit / Delete** — same pattern as asset types.
- **Merge** — combine duplicate manufacturer entries. All assets from the source manufacturer are reassigned to the target, then the source is deleted.

---

## Suppliers

**Administration → Suppliers**

Suppliers (resellers/vendors you purchase from — distinct from manufacturers) with an optional contract reference and contact info, for supply-chain evidence.

- **Create / Edit / Delete** — deletion is blocked while assets still reference the supplier.
- **Default window** — expand a supplier to set a *Default from* / *Default until* period. Assets created within that period without an explicit supplier are assigned this supplier automatically (manual creation, CSV import, and stock deployment alike). Leave *until* empty for open-ended. Windows may not overlap between suppliers. The pre-filled supplier can always be overridden per asset in the asset form.

---

## Model Cleanup

**Administration → Model Cleanup**

Review clusters of similar-but-not-identical asset model spellings (typos, abbreviations) and merge them into a single canonical spelling. Only clusters that couldn't be safely auto-merged (see the `assets:normalize-models` maintenance script) are shown here. Each entry shows its asset count, asset type(s), and manufacturer(s) as context, since spelling similarity alone can't tell apart genuinely different products (e.g. "...RX" vs "...TX" variants).

- **Choose the correct spelling** — pick one of the listed spellings, or select **Use a custom spelling** to type a corrected name if none of them are exactly right.
- **Exclude items** — uncheck any entry that doesn't actually belong with the rest of the cluster before merging; unchecked entries are left untouched.
- Click **Merge** to rewrite every checked entry to the chosen spelling.

**Rename a model** — below the cluster list, search for any model (even one with no detected duplicates — e.g. a single consistently-misspelled entry) and rename it directly. All assets using that spelling are batch-updated to the new name.

---

## Firmware Baselines

**Administration → Firmware Baselines**

The approved firmware version per asset type, optionally narrowed to one model.
A row naming a model wins over the type-wide row.

**Firmware in the field** lists the versions devices actually report, grouped by
type and model, with the number of devices on each version. Each group that has
no baseline yet offers one-click creation at the highest version seen, so
baselines come from observed reality rather than guesswork — a fleet of hundreds
of devices usually collapses to a handful of groups.

**Approved versions** lists what is configured. Click a version to edit it in
place. Deleting a baseline returns every matching asset to *unclassified*, so it
is recorded in the audit log.

### How a device is judged

| Status | Meaning |
|---|---|
| Up to date | Installed version is at or above the baseline. A device ahead of the baseline is not flagged, so a staged rollout stays quiet |
| Outdated | Installed version is below the baseline |
| Evidence expired | At or above the baseline, but the reading is older than the configured validity window |
| Unclassified | No baseline configured for this asset type or model |
| No version reported | No version has ever been established — no API and nothing recorded by hand |
| Unorderable | Installed and approved versions could not be compared |

Only *up to date* is evidence of currency. The rest are unmeasured, never
compliant. A version *below* the baseline stays outdated however old the reading
— staleness must not hide a real violation.

Versions are collected by the `assets:sync-firmware` script; see
[Maintenance Scripts](../technical/scripts.md).

### Recording a version by hand

Many AV devices have no API and can never report their firmware. On the asset
page, the **Firmware** field lets anyone but a Viewer record what they saw; it is
tagged *attested* rather than *reported*, and stamped with who and when.

An attestation ages like any other evidence. Past **Settings → Firmware evidence
validity (days)** (default 90) it becomes *evidence expired*, so someone has to
look again — an entry that counted forever would be worse than none. If the
device later gains an API, the next sync replaces the attestation: measured
evidence beats recollection.

---

## Audit Log

**Administration → Audit Log**

Every create, update, delete, import, and export action is recorded with the user's email, timestamp, IP address, and a before/after diff of changed fields. Authentication events are recorded too: successful logins, failed logins (with the reason, including failed 2FA codes), and logouts.

Use the **search box** and **filter dropdowns** to narrow by action type (CREATE, UPDATE, DELETE, IMPORT, EXPORT, LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT) or entity type (Asset, Location, User, etc.).

Retention is configured in **Settings → Security & compliance** and enforced by a scheduled purge script — entries cannot be deleted through the UI or API.

---

## Export

**Administration → Export**

Download a full CSV export of all assets. The export includes all fields, MAC addresses, custom fields, and location paths.

---

## Settings

**Administration → Settings**

Application-wide configuration managed through the UI. Changes take effect immediately without a server restart. This includes:

- **General** — hostname / MAC address / location URL templates. Each turns a
  value into a clickable link to an external system. Point them at Grafana to
  reach the monitoring dashboards from SAM:
  `https://grafana.example.com/d/sam-device/device?var-hostname={hostname}` for
  hostnames, and
  `https://grafana.example.com/d/sam-room/room?var-fi_number={fi_number}` for
  locations, which adds a *Monitoring* badge to the location page. A location
  without an FI number shows no link.
- **Branding** — site name, logo, favicon, background.
- **Security & compliance** — require two-factor authentication for all local accounts, audit log retention (days), the default asset owner (e.g. a team account applied to new assets when no owner is chosen), and which fixed work-log item + period counts as the periodic inventory review on the compliance dashboard.
- **Work log items** — define fixed work log items (e.g. *Review asset list*) that technicians can select on a location's work log. These power location coverage reports. See [Work Logs](work-logs.md#fixed-work-log-items).

---

## Compliance Dashboard

**Administration → Compliance**

One page aggregating the NIS2 evidence gaps, each as a stat card with an expandable sample list:

- **Assets without owner** and **assets unclassified** (no criticality on the asset or its type)
- **Assets past end-of-support** (plus how many have no date at all)
- **Firmware outdated**, **firmware evidence expired**, and **firmware unmeasured** —
  the last of these states the share of monitored assets whose currency can be
  judged at all, because devices with no API can never report a version. Read
  every firmware figure against that percentage: a small unmeasured count over a
  small measurable population is not the reassurance it looks like. See
  [Firmware Baselines](#firmware-baselines).
- **Locations not reviewed** — leaf locations missing the configured review work-log item within the review period
- **Local users without 2FA** and the **audit forwarding backlog**

The hostname compliance report (per-type hostname pattern conformity) lives on the same page. The same numbers are exported as Prometheus gauges — see [Integrations](../technical/integrations.md).

---

## Access Review

**Administration → Users → Export CSV**

Downloads a CSV of every account with name, email, role, provider, 2FA status and **last login** — the artifact for periodic access reviews. The user table also shows the last-login column, sortable, so stale accounts stand out.

---

## Decommissioned Assets

**Decommissioned** (sidebar)

Lists all decommissioned assets across all locations. Use the search box to find a specific device.

Decommissioning an asset requires choosing a **disposal method** (wiped / destroyed / returned / resold / other) and optionally a note; SAM records who performed the decommissioning. These appear on the asset detail page and in the decommissioned CSV export as disposal evidence.

Admins can **reinstate** a decommissioned asset — it returns to its last recorded location with status INSTALLED and its disposal record is cleared.

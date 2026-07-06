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

## Model Cleanup

**Administration → Model Cleanup**

Review clusters of similar-but-not-identical asset model spellings (typos, abbreviations) and merge them into a single canonical spelling. Only clusters that couldn't be safely auto-merged (see the `assets:normalize-models` maintenance script) are shown here. Each entry shows its asset count, asset type(s), and manufacturer(s) as context, since spelling similarity alone can't tell apart genuinely different products (e.g. "...RX" vs "...TX" variants).

- **Choose the correct spelling** — pick one of the listed spellings, or select **Use a custom spelling** to type a corrected name if none of them are exactly right.
- **Exclude items** — uncheck any entry that doesn't actually belong with the rest of the cluster before merging; unchecked entries are left untouched.
- Click **Merge** to rewrite every checked entry to the chosen spelling.

**Rename a model** — below the cluster list, search for any model (even one with no detected duplicates — e.g. a single consistently-misspelled entry) and rename it directly. All assets using that spelling are batch-updated to the new name.

---

## Audit Log

**Administration → Audit Log**

Every create, update, delete, import, and export action is recorded with the user's email, timestamp, IP address, and a before/after diff of changed fields.

Use the **search box** and **filter dropdowns** to narrow by action type (CREATE, UPDATE, DELETE, IMPORT, EXPORT) or entity type (Asset, Location, User, etc.).

---

## Export

**Administration → Export**

Download a full CSV export of all assets. The export includes all fields, MAC addresses, custom fields, and location paths.

---

## Settings

**Administration → Settings**

Application-wide configuration managed through the UI. Changes take effect immediately without a server restart. This includes:

- **General** — hostname / MAC address URL templates.
- **Branding** — site name, logo, favicon, background.
- **Work log items** — define fixed work log items (e.g. *Review asset list*) that technicians can select on a location's work log. These power location coverage reports. See [Work Logs](work-logs.md#fixed-work-log-items).

---

## Decommissioned Assets

**Decommissioned** (sidebar)

Lists all decommissioned assets across all locations. Use the search box to find a specific device.

Admins can **reinstate** a decommissioned asset — it returns to its last recorded location with status INSTALLED.

---
title: "Search & Reports"
sync_to_confluence: true
---

# Search & Reports

## Search

The **search box** in the top navigation bar searches across all assets and locations in real time.

Search matches against:
- Asset model, serial number, hostname
- Asset type and manufacturer name
- Location name and FI number

Click a result to navigate directly to that asset or location.

### Advanced browsing

To browse assets without a specific search term, navigate to a location and use the **filter box** on the Assets tab to narrow down by model, serial, type, or hostname within that location.

---

## Reports

Reports let you query and export asset data using custom filters. Saved reports can be run at any time.

### Accessing reports

Click **Reports** in the left sidebar.

### Running an existing report

Click a report name in the list to run it. Results appear in a table. Click **Export CSV** to download the results.

### Report types

When creating a report you choose a **report type**:

- **Assets** — the default. Query and export asset records (described below).
- **Locations** — a coverage matrix over [fixed work log items](work-logs.md#fixed-work-log-items). Each **leaf location** (a location with no sub-locations) becomes a row, and each selected work log item becomes a column showing whether that location has the item *filled in* (with the date of the most recent entry) or *not filled in*. A **Show** filter limits the rows to all / only filled / only not filled. This answers questions like *"which rooms have had their asset list reviewed?"*.

  Rows are grouped by **campus** then **building** (derived from the location tree), with rooms listed alphabetically within each group.

  An optional **time window** (e.g. *within the last 1 year*) makes the check periodic: an item only counts as filled if its most recent entry falls inside the window; older entries are shown as overdue. Combine the window with *Show: Only not filled in* to list every location whose review is due — for example *all rooms not reviewed in the last year*.

  An optional **location scope** restricts the rows to one or more selected locations — any level of the tree (campus, building, floor, or room). Every leaf location under a selected node is included. Leave it empty to include all locations.

### Creating an asset report

1. Click **New report**.
2. Give the report a name.
3. Leave the report type as **Assets**.
4. Add **filters** to narrow the results:

| Filter field | Description |
|---|---|
| Asset type | Filter by one or more asset types |
| Manufacturer | Filter by manufacturer |
| Location | Filter by location (includes all sub-locations) |
| Installation date | Before / after a date, or older/newer than N years |
| Model | Contains a text string |
| Serial number | Contains a text string |
| Hostname | Contains a text string; "is empty" / "is not empty" options |
| Work log item | Whether a [fixed work log item](work-logs.md#fixed-work-log-items) *is filled in* / *is not filled in* for the asset (any work log entry tagged with that item). Combine with an asset-type filter to track a recurring task across all assets of one type. |
| Supplier | Filter by supplier; "is empty" / "is not empty" options |
| Criticality | Filter by the **effective** criticality — a per-asset override or the type default. "Is empty" finds unclassified assets |
| End of support | Before / after a date, older/newer than N years, or "is empty" for assets without a date |

The supplier, criticality (effective value) and end-of-support fields are also available as columns.

5. Select which **columns** to include in the results.
6. Optionally set a **group by** field to summarise counts per type, manufacturer, location, or installation year.
7. Click **Run** to preview results, then **Save** to keep the report.

### Creating a location report

1. Click **New report** and give it a name.
2. Set the **report type** to **Locations**.
3. Optionally search and select one or more locations under **Location scope** to limit the report to specific campuses, buildings, floors, or rooms. Leave empty to include every location.
4. Select one or more **work log items** to report on.
5. Optionally set **Show** to *Only filled in* or *Only not filled in*.
6. Optionally set a **time window** (number + days/months/years) — leave the number empty to count entries from any date.
7. **Save** the report, then open it to see the per-location coverage table, grouped by campus and building. Export to CSV as usual.

### Editing or deleting a report

Open the report and click **Edit** to change filters or columns. Click **Delete** to remove it permanently.

> Viewers can run reports but cannot create, edit, or delete them.

---

## Hostname compliance

A fixed report that shows how well hostnames match the naming rules configured per asset type — used to demonstrate NIS2 compliance. Open it from **Administration → Compliance** (Admin menu).

### What it measures

For every asset type it reports, over the **active** (installed) assets of that type:

- **With hostname** — the number of assets that have a hostname (the rate denominator).
- **Compliant** / **Non-compliant** — whether each hostname matches the type's configured pattern. Types **without** a configured pattern are measured against the generic FQDN check that the app already enforces (shown as *FQDN fallback*).
- **No hostname** — assets with no hostname at all. These are shown for context but are **excluded** from the compliance rate.
- **Rate** — compliant ÷ with-hostname, shown as a percentage. Types with no measurable assets show *n/a*.

An **overall** compliance figure is shown at the top. Types are listed worst-first.

### Seeing which hosts fail

Click a type row to expand the list of its non-compliant hosts (hostname, model, serial, location). Click **Export non-compliant CSV** to download every non-compliant host across all types.

> Requires Admin role.

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

### Creating a report

1. Click **New report**.
2. Give the report a name.
3. Add **filters** to narrow the results:

| Filter field | Description |
|---|---|
| Asset type | Filter by one or more asset types |
| Manufacturer | Filter by manufacturer |
| Location | Filter by location (includes all sub-locations) |
| Installation date | Before / after a date, or older/newer than N years |
| Model | Contains a text string |
| Serial number | Contains a text string |
| Hostname | Contains a text string; "is empty" / "is not empty" options |

4. Select which **columns** to include in the results.
5. Optionally set a **group by** field to summarise counts per type, manufacturer, location, or installation year.
6. Click **Run** to preview results, then **Save** to keep the report.

### Editing or deleting a report

Open the report and click **Edit** to change filters or columns. Click **Delete** to remove it permanently.

> Viewers can run reports but cannot create, edit, or delete them.

---
title: "Import & Export"
sync_to_confluence: true
---

# Import & Export

## CSV Import

Bulk import assets from a spreadsheet. Useful for migrating data from a legacy system or doing a large initial data entry.

### Accessing the import tool

Click **Import** in the left sidebar.

### Preparing the CSV file

The CSV file must have a header row. The following column names are recognised:

| Column | Required | Description |
|---|---|---|
| `LOKAAL` | Yes | Room/location name (matched or created) |
| `CAMPUS` | No | Campus name (parent of building) |
| `GEBOUW` | No | Building name (parent of room) |
| `FI NUMMER` | No | FI number stored on the location |
| `TYPE` | No | Asset type name (created if not exists) |
| `BRAND` | No | Manufacturer name (created if not exists) |
| `MODEL` | No | Asset model |
| `SERIAL` | No | Serial number |
| `MAC` | No | MAC address(es), comma/semicolon/pipe-separated for multiple |
| `IP_HOSTNAME` | No | Hostname |
| `INSTALL_DATE` | No | Installation date (ISO format or DD/MM/YYYY) |
| `Factuurnummer` | No | Invoice number |
| `Factuurdatum` | No | Invoice date |
| `GUID` | No | Stored as a custom field |
| `QUANTITY` | No | Stored as a custom field |

Additional columns not listed above are imported as **custom fields** on the asset.

### Running an import

1. Click **Import** in the sidebar.
2. Click **Choose file** and select your CSV.
3. Review the **preview** — it shows the number of rows detected and any column mapping issues.
4. Click **Import** to run.
5. Review the **results**: how many assets were created, how many rows were skipped, and any errors.

> Each import row creates a new asset. There is no duplicate detection — re-importing the same file creates duplicate assets.

> MAC addresses are normalized to `AA:BB:CC:DD:EE:FF` on import regardless of the source format (no separator, hyphens, lowercase, Cisco dot-grouping). A value that can't be normalized (wrong digit count, non-hex characters) is imported as-is and listed in the results as an error for manual review.

> Requires Editor or Admin role.

---

## CSV Export

Download a full export of all assets as a CSV file.

### Running an export

1. Go to **Administration → Export** (Admin menu).
2. Click **Export CSV**.
3. The file downloads immediately.

The export contains all asset fields including custom fields, MAC addresses, location path, and timestamps.

> Requires Admin role or a configured export API token.

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

Download the inventory as CSV files. Go to **Administration → Export** (Admin menu) — three downloads are available.

### Active assets export

Click **Download CSV**. Contains only **currently active** assets (status *Installed*), including custom fields, MAC addresses, location path, and timestamps. Assets in rooms that are in maintenance still count as active and are included. Decommissioned assets are **not** included. This is the import-compatible format.

### Decommissioned assets export

Click **Download decommissioned CSV**. Contains only assets that have been **decommissioned**. In addition to the standard asset columns it adds:

| Column | Description |
|---|---|
| `DECOMMISSIONED_AT` | Date the asset was decommissioned |
| `DECOMMISSION_NOTE` | Free-text note recorded at decommission time |
| `LAST_LOCATION` | Location name snapshot captured at decommission time |
| `LAST_FI_NUMBER` | FI number snapshot captured at decommission time |

### Stock export

Click **Download stock CSV**. Contains the current stock inventory (items not yet deployed to a location): type, brand, model, serial, quantity, the location it is reserved for (if any), MAC address, notes, and invoice details.

> All three exports require Admin role. The active-assets export can also be fetched with a configured export API token; the decommissioned and stock exports require an admin session.

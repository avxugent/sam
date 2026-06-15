---
title: "Stock Management"
sync_to_confluence: true
---

# Stock Management

Stock items represent hardware that has been received but not yet installed. Use stock management to track spare equipment, reserve items for specific locations, and deploy them when installation is ready.

## Accessing stock

Click **Stock** in the left sidebar.

## Stock item list

The stock list shows all items in inventory. Each row shows the asset type, manufacturer, model, serial number (or quantity for bulk items), and any reservation.

Use the **search box** to filter by type, model, serial number, or manufacturer. Results can be sorted by clicking column headers.

## Adding a stock item

1. Click **Add stock item**.
2. Fill in:
   - **Type** and **Manufacturer** — required
   - **Model** — required
   - **Serial number** — enter if the item has a fixed serial; leave blank for bulk items
   - **Quantity** — for bulk items without individual serials
   - **MAC address** — optional; carried over to the asset when a single unit is deployed
   - **Invoice number** — optional purchase reference
   - **Notes** — optional
   - **Reserved for location** — optionally link to the location this item is destined for
3. Click **Save**.

> Requires Editor or Admin role.

## Deploying stock to a location

Deploying creates a new installed asset at a target location and removes the item from stock.

1. Find the stock item in the list.
2. Click the **Deploy** icon (arrow).
3. Search for and select the target location.
4. If the item is a bulk item (quantity > 1), set how many units to deploy and optionally enter serial numbers for each unit.
5. Click **Deploy**.

SAM creates one asset per deployed unit at the target location. Any metadata stored on the stock item (hostname, MAC addresses, custom fields) is carried over to the new asset.

> Requires Editor or Admin role.

## Editing a stock item

Click the **pencil icon** on the row to update any field.

> Requires Editor or Admin role.

## Deleting a stock item

Click the **trash icon** on the row and confirm. Only delete items that were entered in error — use **Deploy** for items that have been installed.

> Requires Editor or Admin role.

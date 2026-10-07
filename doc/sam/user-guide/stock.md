---
title: "Stock Management"
sync_to_confluence: true
---

# Stock Management

Stock items represent hardware that has been received but not yet installed. Use stock management to track spare equipment kept across different storage locations, and deploy them when installation is ready.

## Accessing stock

Click **Stock** in the left sidebar.

## Stock item list

The stock list shows all items in inventory. Each row shows the asset type, manufacturer, model, serial number (or quantity for bulk items), and its storage location.

Use the **search box** to filter by type, model, serial number, or manufacturer, and the **location filter** to narrow the list down to stock kept at a specific location. The location filter only lists locations that currently hold stock, to keep it short. Results can be sorted by clicking column headers.

## Adding a stock item

1. Click **Add stock item**.
2. Fill in:
   - **Type** and **Manufacturer** — required
   - **Model** — required; pick from the fixed list scoped to the selected type/manufacturer (see [Administration → Models](administration.md))
   - **Storage location** — where this item is physically kept; the list only shows locations that already hold stock, so tick **Show all locations** to pick one that doesn't yet — the item you're adding becomes its first, and it appears in the restricted list from then on. Leave unset to keep the item "Unassigned"
   - **Serial number** — enter if the item has a fixed serial; leave blank for bulk items
   - **Quantity** — for bulk items without individual serials
   - **MAC addresses** — optional; add as many as needed with **Add MAC address**. Each is checked and formatted the same way as on the asset form. All of them are carried over to the asset when a single unit is deployed
   - **Invoice number** — optional purchase reference
   - **Notes** — optional
   - **Reserved for location** — optionally link to the location this item is destined for
3. Click **Save**.

A location that still holds stock cannot be deleted — move or unassign its stock first.

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

## Relocating multiple items at once

Check the box on each row you want to move (or use the header checkbox to select every row currently matching your search), then click **Relocate selected** in the toolbar that appears. Pick a destination location — or leave it "Unassigned" — and confirm. Items that could no longer be found (e.g. deleted by someone else in the meantime) are skipped and listed; the rest are relocated normally.

> Requires Editor or Admin role.

## Editing a stock item

Click the **pencil icon** on the row to update any field.

> Requires Editor or Admin role.

## Deleting a stock item

Click the **trash icon** on the row and confirm. Only delete items that were entered in error — use **Deploy** for items that have been installed.

> Requires Editor or Admin role.

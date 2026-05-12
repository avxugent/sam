---
title: "Locations"
sync_to_confluence: true
---

# Locations

Locations represent physical spaces — campuses, buildings, floors, rooms, or any other level you need. They form a tree: a room is inside a floor, which is inside a building, and so on. There is no depth limit.

## Browsing locations

The left sidebar shows the full location tree. Click the arrow next to a location to expand or collapse its children. Click the location name to open its detail page.

Use the **search box at the top of the sidebar** to filter the tree by name. Matching locations stay visible; unmatched ones are hidden.

## Location detail page

Opening a location shows tabs:

| Tab | What it contains |
|---|---|
| **Assets** | All assets installed in this location |
| **Sub-locations** | Child locations nested inside this one |
| **Map** | Map pin and address information |
| **Attachments** | Files and links attached to this location |
| **Work Log** | Maintenance and work history |

A **cover image** can be pinned to a location — it appears as a hero image at the top of the detail page. Set it by uploading an image on the Attachments tab, then selecting it as the cover.

## Creating a location

1. Open the parent location where the new one should appear.
2. On the **Sub-locations** tab, click **Add sub-location**.
3. Fill in the name and optionally:
   - **FI number** — the facility identifier in `CC.BB.FFF.RRR` format (e.g. `14.10.100.013`). Must be unique.
   - **Description** — free text notes.
   - **Address fields** — street, city, country for map display.
4. Click **Save**.

> Requires Editor or Admin role.

## Editing a location

Click the **Edit** button on the location detail page. Change any fields and click **Save**.

## Reordering sub-locations

On the Sub-locations tab, drag and drop rows to change the display order.

## Deleting a location

Click **Delete** on the location detail page. A location can only be deleted when it has no assets and no sub-locations. Move or delete these first.

> Requires Editor or Admin role.

## FI number

The FI number (`fiNumber`) is a structured facility code in the format `CC.BB.FFF.RRR`:

| Segment | Meaning | Example |
|---|---|---|
| `CC` | Campus | `14` |
| `BB` | Building | `10` |
| `FFF` | Floor | `100` |
| `RRR` | Room | `013` |

FI numbers are used by the Prometheus integration to label monitoring metrics with location context. They must be unique across all locations.

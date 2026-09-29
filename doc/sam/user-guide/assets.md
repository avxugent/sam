---
title: "Assets"
sync_to_confluence: true
---

# Assets

An asset is a physical piece of AV hardware installed in a location — a projector, display, audio processor, recorder, and so on.

## Viewing assets

Assets appear on the **Assets tab** of their location. Click an asset row to open its detail page.

The asset detail page shows:
- Type, manufacturer, model, serial number
- Hostname and MAC addresses
- Installation date, invoice number and date, warranty months
- Notes
- Custom fields (defined per asset type)
- Vault credentials path (if configured)
- Attachments
- Work log
- History — every lifecycle event for this physical item, including its hops through stock (deployed, returned, redeployed), decommission, and repair

## Creating an asset

1. Open the location where the asset is installed.
2. On the **Assets tab**, click **Add Asset**.
3. Fill in the required fields:
   - **Type** — select from the list or type to create a new one
   - **Manufacturer** — select or create
   - **Model** — start typing to see matching spellings already in use (scoped to the selected type/manufacturer); pick one to reuse its exact spelling, or choose **Create "..."** to add a new one. If what you type is close to but not exactly an existing model name, you'll also be asked whether you meant the existing spelling when you leave the field
4. Fill in optional fields as needed.
5. If you enter a **hostname**, at least one **MAC address** is required. The hostname must match the format configured for the asset's type (see [Administration → Asset Types](administration.md)), or a generic domain-name format if the type has no format configured. Hostnames must be unique — no two assets, including decommissioned ones, can share a hostname.
6. Click **Save**.

> Requires Editor or Admin role.

## Editing an asset

On the asset detail page, click **Edit**. Change any fields and click **Save**.

## Custom fields

Custom fields allow you to store extra data per asset. They are free-form key/value pairs — add as many as needed using the **+ Add field** button in the asset form.

Common uses: GUID, diagonal size, resolution, microphone type, mount height.

## Moving an asset

On the asset detail page, click **Move**. Select the target location from the search tree and confirm.

> Requires Editor or Admin role.

## Decommissioning an asset

When a device is retired, decommission it instead of deleting it. This preserves the history.

1. Open the asset detail page.
2. Click **Decommission**.
3. Optionally enter a reason or note.
4. Click **Confirm**.

Decommissioned assets move to the **Decommissioned** section (accessible from the sidebar). They keep their last location name for reference. An asset currently sent for repair can also be decommissioned directly.

> Requires Editor or Admin role.

## Reinstating a decommissioned asset

If a decommissioned asset is put back into service:

1. Go to the **Decommissioned** page from the sidebar.
2. Find the asset and click **Reinstate**.
3. The asset returns to its last recorded location.

> Requires Admin role.

## Returning an asset to stock

If a device needs to go back to spare inventory without being decommissioned:

1. Open the asset detail page.
2. Click **Return to stock**.
3. Pick the storage location the item is physically going to — this is required before the return can be confirmed.
4. The asset is moved to the Stock inventory at that location and removed from its location.

An asset currently sent for repair can also be returned to stock — it's not limited to installed assets.

> Requires Editor or Admin role.

## Sending an asset for repair

When a device needs off-site or vendor repair but isn't being retired:

1. Open the asset detail page.
2. Click **Send for repair** and optionally enter a note (e.g. supplier, RMA number).
3. Confirm.

The asset is marked **In Repair** and removed from its location's active asset list; a banner on its detail page shows when it was sent and by whom. It does **not** automatically return to its location — once repaired, return it to stock (to redeploy later) or decommission it if it can't be fixed.

All assets currently in repair are listed on the **In Repair** page in the sidebar.

> Requires Editor or Admin role. Only available for installed assets — an asset already in repair or decommissioned can't be sent again.

## Bulk actions

On a location's **Assets tab**, check the box on each row you want to act on (or use the header checkbox to select every row currently matching your search), then use the toolbar that appears:

- **Decommission** — choose a disposal method (and optional note) once; it's applied to every selected asset.
- **Return to stock** — pick a storage location (required), confirm once; every selected asset is converted to a stock item at that location.

Assets that can't be processed (e.g. already decommissioned, or missing a model for return-to-stock) are skipped and listed with a reason; the rest complete normally.

> Requires Editor or Admin role.

## Deleting an asset

Deletion is permanent and removes all history. Use decommissioning instead unless the asset was created in error.

On the asset detail page, click **Delete** and confirm.

> Requires Editor or Admin role.

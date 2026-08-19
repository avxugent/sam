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

Decommissioned assets move to the **Decommissioned** section (accessible from the sidebar). They keep their last location name for reference.

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
3. The asset is moved to the Stock inventory and removed from its location.

> Requires Editor or Admin role.

## Deleting an asset

Deletion is permanent and removes all history. Use decommissioning instead unless the asset was created in error.

On the asset detail page, click **Delete** and confirm.

> Requires Editor or Admin role.

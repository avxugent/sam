---
title: "Work Logs"
sync_to_confluence: true
---

# Work Logs

Work logs record maintenance, repairs, inspections, and other work performed on a location or asset. They provide a searchable history of what was done, when, and by whom.

## Viewing work logs

Work logs appear on the **Work Log tab** of any location or asset detail page. They are listed in reverse chronological order.

## Creating a work log entry

1. Open the Work Log tab on a location or asset.
2. Click **Add work log**.
3. Fill in:
   - **Date** — when the work was performed (defaults to today)
   - **Description** — what was done
   - **Asset** — optionally link to a specific asset within the location (location work logs only)
   - **JIRA issue key** — optionally link to a JIRA ticket (e.g. `AVT-123`)
4. Click **Save**.

> Requires Editor or Admin role.

## JIRA integration

If a JIRA issue key is entered, SAM fetches the issue title and current status from JIRA and displays it as a badge on the work log entry. This requires the JIRA integration to be configured by your administrator.

Clicking the badge opens the issue directly in JIRA.

## Editing a work log entry

Click the **pencil icon** on the entry and update the fields.

> Requires Editor or Admin role.

## Deleting a work log entry

Click the **trash icon** on the entry and confirm.

> Requires Admin role.

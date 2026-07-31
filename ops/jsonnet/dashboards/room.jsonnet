// Room drill-down — "what is wrong in this room".
//
// Reached from the fleet table, or straight from SAM's location tree with the
// variable prefilled:
//
//   /d/sam-room/room?var-fi_number=14.10.100.013
//
// The device table is the point of this dashboard. Its state column folds four
// conditions into one value so a room's problems are readable at a glance:
// reporting, probed and failed, in maintenance, or never scraped at all.

local sam = import '../lib/sam.libsonnet';

local room = '{sam_fi_number="$fi_number"}';
local roomSel = 'sam_fi_number="$fi_number"';

sam.dashboard(
  uid='sam-room',
  title='SAM — Room',
  description=|||
    Monitoring status for a single room.

    Devices come from SAM's inventory, so one that service discovery never
    advertised still appears here — as "Never scraped" rather than not at all.
  |||,
  variables=[
    sam.singleVar('fi_number', 'Room (FI number)', 'sam_asset_info', 'sam_fi_number'),
  ],
  groups=[
    [
      sam.stat(
        'Devices',
        '(sum(%s)) or vector(0)' % ('room:assets_expected:count' + room),
      ),
      sam.stat(
        'Reporting',
        '(sum(%s)) or vector(0)' % ('room:assets_reporting:count' + room),
        thresholds=sam.thresholdsNeutral,
      ),
      sam.stat(
        'Not reporting',
        '(sum(%s)) or vector(0)' % ('room:assets_down:count' + room),
        thresholds=sam.thresholdsAnyIsBad,
      ),
      sam.stat(
        'Never scraped',
        '(sum(%s)) or vector(0)' % ('room:assets_never_scraped:count' + room),
        thresholds=sam.thresholdsAnyIsBad,
        description='No probe series exists — points at service discovery or the asset type scrape template, not the device.',
      ),
      sam.stat(
        'In maintenance',
        '(sum(%s)) or vector(0)' % ('room:assets_maintenance:count' + room),
        thresholds=sam.thresholdsAnyIsWarn,
      ),
      sam.stat(
        'Availability',
        'room:health:ratio%s' % room,
        unit='percentunit',
        thresholds=sam.thresholdsRatio,
      ),
    ],

    sam.row('Devices'),
    [
      sam.table(
        'Devices in this room',
        // A carries the inventory metadata and covers every device, including
        // those with no metrics at all. B is the folded state value.
        targets=[
          {
            expr: 'sum by (sam_hostname, sam_asset_type, sam_manufacturer, sam_model, sam_criticality) (sam_asset_info%s)' % room,
          },
          { expr: sam.stateExpr(roomSel) },
        ],
        joinField='sam_hostname',
        rename={
          sam_hostname: 'Hostname',
          sam_asset_type: 'Type',
          sam_manufacturer: 'Manufacturer',
          sam_model: 'Model',
          sam_criticality: 'Criticality',
          'Value #B': 'State',
        },
        order=[
          'sam_hostname',
          'Value #B',
          'sam_asset_type',
          'sam_manufacturer',
          'sam_model',
          'sam_criticality',
        ],
        // Value #A is the inventory series' constant 1 — no information.
        hidden=['Value #A'],
        // No noValue here: a null State must stay null so it maps to
        // "Never scraped" rather than being coerced to 0, "Not reporting".
        overrides=[
          sam.overrideByName('State', [
            { id: 'mappings', value: sam.stateMappings },
            { id: 'custom.cellOptions', value: { type: 'color-text' } },
          ]),
          sam.overrideByName('Hostname', [
            {
              id: 'links',
              value: [sam.dataLink('Device detail', '/d/sam-device/device?var-hostname=${__value.text}')],
            },
          ]),
        ],
        h=12,
        description='Click a hostname to drill into that device.',
      ),
    ],

    sam.row('History'),
    [
      sam.timeseries(
        'Room availability',
        [{ expr: 'room:health:ratio%s' % room, legend: 'Reporting' }],
        w=12,
        h=8,
        unit='percentunit',
        min=0,
        max=1,
      ),
      sam.timeseries(
        'Probe duration by device',
        [{
          expr: 'max by (sam_hostname) (probe_duration_seconds%s)' % room,
          legend: '{{sam_hostname}}',
        }],
        w=12,
        h=8,
        unit='s',
        min=0,
        description='A device climbing steadily is often failing before it fails.',
      ),
    ],
  ],
)

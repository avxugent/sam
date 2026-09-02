// Alerts overview — "what is on fire, and where".
//
// Reads Prometheus's built-in ALERTS series rather than any sam_* metric, so
// this dashboard shows exactly what Alertmanager would page on — no
// independent notion of "broken" to drift out of sync with ops/ansible/roles/
// prometheus_sam_rules/files/sam-alerts.yml.
//
// ALERTS carries every label of the query each alert rule evaluates, and that
// query differs per rule (see sam-alerts.yml): a per-device alert like
// SamAssetNotReporting carries sam_hostname, sam_asset_type, sam_model and
// friends; a room-level alert like SamRoomDegraded only carries the room
// labels; a fleet-wide alert like SamInventoryMetricsAbsent carries no sam_*
// label at all. The active-alerts table below shows the union of all of
// these, so a fleet-wide alert simply renders with blank Room/Hostname cells
// rather than being dropped.

local sam = import '../lib/sam.libsonnet';

local firing = 'ALERTS{alertstate="firing"}';

local severityMappings = [
  {
    type: 'value',
    options: {
      critical: { text: 'critical', color: 'red', index: 0 },
      warning: { text: 'warning', color: 'orange', index: 1 },
      info: { text: 'info', color: 'blue', index: 2 },
    },
  },
];

local severityOverride = sam.overrideByName('Severity', [
  { id: 'mappings', value: severityMappings },
  { id: 'custom.cellOptions', value: { type: 'color-text' } },
]);

sam.dashboard(
  uid='sam-alerts',
  title='SAM — Alerts',
  description=|||
    Currently firing alerts across the fleet, and which rooms they affect.

    Sourced from Prometheus's ALERTS series, so this always matches what
    Alertmanager is actually paging on. A room appears here only while an
    alert about it is firing — it is not a room inventory (see the Fleet
    overview dashboard for that).
  |||,
  groups=[
    sam.row('Overview'),
    [
      sam.stat(
        'Firing alerts',
        'count(%s) or vector(0)' % firing,
        w=6,
        h=8,
        thresholds=sam.thresholdsAnyIsBad,
      ),
      sam.stat(
        'Rooms with issues',
        'count(count by (sam_fi_number) (ALERTS{alertstate="firing", sam_fi_number!=""})) or vector(0)',
        w=6,
        h=8,
        thresholds=sam.thresholdsAnyIsBad,
        description='Distinct rooms with at least one firing alert. Fleet-wide alerts (no room label) are not counted here.',
      ),
      sam.table(
        'Alerts by severity',
        targets=[{ expr: 'count by (severity) (%s)' % firing }],
        joinField='severity',
        rename={ severity: 'Severity', Value: 'Count' },
        order=['severity', 'Value'],
        sortBy=[{ displayName: 'Severity', desc: false }],
        overrides=[severityOverride],
        w=12,
        h=8,
        description='Firing alert instances grouped by severity. A severity with nothing firing has no row.',
      ),
    ],

    sam.row('Active alerts'),
    [
      sam.table(
        'Active alerts, grouped by room',
        targets=[{ expr: firing }],
        joinField='alertname',
        rename={
          sam_location_name: 'Room',
          sam_fi_number: 'FI number',
          sam_campus: 'Campus',
          sam_building: 'Building',
          severity: 'Severity',
          alertname: 'Alert',
          sam_hostname: 'Hostname',
          sam_asset_type: 'Type',
          sam_model: 'Model',
        },
        order=[
          'sam_location_name',
          'sam_fi_number',
          'sam_campus',
          'sam_building',
          'severity',
          'alertname',
          'sam_hostname',
          'sam_asset_type',
          'sam_model',
        ],
        // Everything below is a label some alert rule's query happens to carry
        // but that is not useful here — see the file header on why the set
        // varies per rule. instance/job come from Prometheus's own scrape
        // target labels on the raw metrics a couple of rules alert on
        // directly (unlike the recording rules, which aggregate them away).
        hidden=[
          'Value', 'alertstate',
          'sam_floor', 'sam_room',
          'sam_manufacturer', 'sam_criticality',
          'instance', 'job',
        ],
        // True row-grouping (one collapsible row per room) needs the
        // groupToNestedTable transform, which only exists from Grafana 11.3
        // on — this fleet runs Grafana 10. Sorting by Room is the Grafana-10
        // way to get the same "everything about one room together" read:
        // same-room alerts land on adjacent rows.
        sortBy=[{ displayName: 'Room', desc: false }],
        overrides=[
          severityOverride,
          sam.overrideByName('FI number', [
            {
              id: 'links',
              value: [sam.dataLink('Room detail', '/d/sam-room/room?var-fi_number=${__value.text}')],
            },
          ]),
          sam.overrideByName('Hostname', [
            {
              id: 'links',
              value: [sam.dataLink('Device detail', '/d/sam-device/device?var-hostname=${__value.text}')],
            },
          ]),
        ],
        w=24,
        h=16,
        description='One row per firing alert, sorted by Room so everything wrong in one room lands together. Filter by Room to isolate one. Blank Room/Hostname means a fleet-wide alert, not tied to any one room or device.',
      ),
    ],
  ],
)

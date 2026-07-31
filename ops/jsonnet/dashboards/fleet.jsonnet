// Fleet overview — "is anything wrong, and where".
//
// Every panel reads the room:* recording rules rather than raw device metrics,
// so the queries stay cheap and the down/maintenance/never-scraped split is
// defined in exactly one place (ops/prometheus/sam-rules.yml).
//
// Firmware panels are deliberately absent: the metrics that back them arrive in
// phase 4. Empty panels teach users to distrust the dashboard.

local sam = import '../lib/sam.libsonnet';

// Campus/building filters. Recording rules carry sam_campus and sam_building so
// every panel below is filterable without touching raw series.
local filter = '{sam_campus=~"$campus", sam_building=~"$building"}';
local roomFilter(rule) = '%s%s' % [rule, filter];

// Assets, not rooms — used where a count of devices is wanted.
local assetFilter = 'sam_asset_info{sam_campus=~"$campus", sam_building=~"$building"}';

// A healthy fleet produces *no* series for the problem rollups, and a stat panel
// renders that as "No data" rather than 0 — which reads as a broken dashboard
// exactly when everything is fine. Zero-fill the counts.
local z(expr) = '(%s) or vector(0)' % expr;

sam.dashboard(
  uid='sam-fleet',
  title='SAM — Fleet overview',
  description=|||
    Monitoring status across all SAM-managed AV assets.

    "Expected" comes from SAM's inventory (sam_asset_info), not from what
    Prometheus happens to be scraping — so a device that service discovery never
    advertised still shows up as missing rather than silently vanishing.
  |||,
  variables=[
    sam.labelVar('campus', 'Campus', 'sam_asset_info', 'sam_campus'),
    sam.labelVar('building', 'Building', 'sam_asset_info', 'sam_building'),
  ],
  groups=[
    sam.row('Fleet status'),
    [
      sam.stat(
        'Monitored assets',
        z('sum(%s)' % roomFilter('room:assets_expected:count')),
        description='Installed assets with a hostname and a Prometheus-exposed type.',
      ),
      sam.stat(
        'Reporting',
        z('sum(%s)' % roomFilter('room:assets_reporting:count')),
        thresholds=sam.thresholdsNeutral,
      ),
      sam.stat(
        'Not reporting',
        z('sum(%s)' % roomFilter('room:assets_down:count')),
        thresholds=sam.thresholdsAnyIsBad,
        description='Expected but not answering any probe. Excludes rooms in maintenance.',
      ),
      sam.stat(
        'Never scraped',
        z('sum(%s)' % roomFilter('room:assets_never_scraped:count')),
        thresholds=sam.thresholdsAnyIsBad,
        description=|||
          No probe series exists at all. Usually a service-discovery or scrape-template
          problem rather than a broken device — check the asset type's template.
        |||,
      ),
      sam.stat(
        'In maintenance',
        z('sum(%s)' % roomFilter('room:assets_maintenance:count')),
        thresholds=sam.thresholdsAnyIsWarn,
        description='Rooms flagged in maintenance in SAM. Excluded from service discovery, so silence is expected.',
      ),
      sam.stat(
        'Rooms with issues',
        z('count(%s > 0)' % roomFilter('room:assets_down:count')),
        thresholds=sam.thresholdsAnyIsBad,
      ),
    ],
    [
      sam.timeseries(
        'Fleet availability',
        [{
          expr: 'sum(%s) / sum(%s)' % [
            roomFilter('room:assets_reporting:count'),
            roomFilter('room:assets_expected:count'),
          ],
          legend: 'Reporting',
        }],
        w=16,
        h=8,
        unit='percentunit',
        min=0,
        max=1,
      ),
      sam.stat(
        'Availability now',
        'sum(%s) / sum(%s)' % [
          roomFilter('room:assets_reporting:count'),
          roomFilter('room:assets_expected:count'),
        ],
        w=8,
        h=8,
        unit='percentunit',
        thresholds=sam.thresholdsRatio,
      ),
    ],

    sam.row('Rooms'),
    [
      sam.table(
        'Rooms — monitoring status',
        // Query A carries the display labels and covers every room, since
        // room:assets_expected:count always has a series. The rest aggregate to
        // the join key alone so they contribute no duplicate label columns and no
        // __name__. A room with nothing wrong has no series in the problem
        // queries at all, which noValue renders as 0 rather than blank.
        targets=[
          {
            expr: 'sum by (sam_fi_number, sam_location_name, sam_campus, sam_building) (%s)'
                  % roomFilter('room:assets_expected:count'),
          },
          { expr: 'sum by (sam_fi_number) (%s)' % roomFilter('room:assets_reporting:count') },
          { expr: 'sum by (sam_fi_number) (%s)' % roomFilter('room:assets_down:count') },
          { expr: 'sum by (sam_fi_number) (%s)' % roomFilter('room:assets_never_scraped:count') },
        ],
        joinField='sam_fi_number',
        rename={
          sam_fi_number: 'FI number',
          sam_location_name: 'Room',
          sam_campus: 'Campus',
          sam_building: 'Building',
          'Value #A': 'Expected',
          'Value #B': 'Reporting',
          'Value #C': 'Not reporting',
          'Value #D': 'Never scraped',
        },
        order=[
          'sam_fi_number',
          'sam_location_name',
          'sam_campus',
          'sam_building',
          'Value #C',
          'Value #D',
          'Value #B',
          'Value #A',
        ],
        sortBy=[{ displayName: 'Not reporting', desc: true }],
        noValue='0',
        h=14,
        description=|||
          Every room, worst first. Columns are sortable and filterable.

          "Never scraped" is a subset of "Not reporting": no probe series exists at
          all, which points at service discovery or the asset type's scrape
          template rather than the device. Rooms in maintenance are excluded from
          both.
        |||,
      ),
    ],

    sam.row('Inventory shape'),
    [
      sam.barGauge(
        'Monitored assets by type',
        'count by (sam_asset_type) (%s)' % assetFilter,
        legend='{{sam_asset_type}}',
      ),
      sam.barGauge(
        'Monitored assets by manufacturer',
        'count by (sam_manufacturer) (%s)' % assetFilter,
        legend='{{sam_manufacturer}}',
      ),
      sam.barGauge(
        'Monitored assets by criticality',
        'count by (sam_criticality) (%s)' % assetFilter,
        legend='{{sam_criticality}}',
        description='Effective criticality — per-asset override, else the asset type default. Blank means unclassified (a NIS2 gap).',
      ),
    ],

    sam.row('Lifecycle'),
    [
      sam.stat(
        'Past end of support',
        z('count((sam_asset_end_of_support_timestamp < time()) and on (sam_hostname) %s)' % assetFilter),
        thresholds=sam.thresholdsAnyIsBad,
      ),
      sam.stat(
        'End of support within 12 months',
        z(|||
          count(
            (sam_asset_end_of_support_timestamp > time()
             and sam_asset_end_of_support_timestamp < time() + 365 * 24 * 3600)
            and on (sam_hostname) %s
          )
        ||| % assetFilter),
        thresholds=sam.thresholdsAnyIsWarn,
      ),
      sam.stat(
        'No end-of-support date',
        'sam_assets_no_end_of_support_date',
        thresholds=sam.thresholdsAnyIsWarn,
        description='Fleet-wide count from SAM inventory — not affected by the campus/building filter.',
      ),
      sam.stat(
        'Assets without a hostname',
        'sam_assets_without_hostname_total',
        thresholds=sam.thresholdsAnyIsWarn,
        description='Cannot be monitored at all. Fleet-wide; not affected by the filter.',
      ),
      sam.stat(
        'Assets without an FI number',
        'sam_assets_without_fi_number_total',
        thresholds=sam.thresholdsAnyIsWarn,
        description='Location metadata incomplete, so these roll up to an empty room. Fleet-wide.',
      ),
    ],
  ],
)

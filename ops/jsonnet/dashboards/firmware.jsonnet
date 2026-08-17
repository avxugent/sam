// Firmware inventory — "what is deployed, and what needs updating".
//
// Two things, both derived from the same join of SAM's inventory
// (sam_asset_info) against the raw per-vendor exporter metrics (each carrying
// a `version` label: extron_firmware_info, pearl_system_info — add to the
// `or` chain below as more vendors report firmware):
//   1. a breakdown of every firmware version currently seen, by type and model
//   2. devices whose installed version does not match the latest known-good
//      version for their model
//
// "Latest known-good" comes from lib/firmware-baseline.libsonnet, a small
// hand-maintained map — not a live signal. See that file for why this is
// intentionally separate from SAM's own (removed) FirmwareBaseline feature.
//
// PromQL has no way to compare two label *values* for equality directly, so
// the baseline map is turned into literal series at build time
// (label_replace(vector(1), ...) chained with `or`, one series per model) and
// matched against real device data using set operations (`unless`/`and`)
// rather than arithmetic. `and on (sam_model)` guards the mismatch query so a
// model with no baseline entry reads as "unknown", not "outdated" — the two
// are different facts and conflating them would make an unmaintained baseline
// look like a fleet full of stale firmware.

local sam = import '../lib/sam.libsonnet';
local baseline = import '../lib/firmware-baseline.libsonnet';

// label_replace's replacement string does its own `$`-expansion (for capture
// group refs like $1) independently of PromQL string-literal escaping, so a
// literal `$` in a model/version needs doubling before the usual quote/
// backslash escaping for the surrounding PromQL string.
local escape(s) =
  local dollarSafe = std.strReplace(s, '$', '$$');
  std.strReplace(std.strReplace(dollarSafe, '\\', '\\\\'), '"', '\\"');

local models = std.objectFields(baseline);

// One static series per baseline entry: {sam_model="...", latest_version="..."}.
// Purely a build-time literal — it never touches the TSDB — so the join below
// can use ordinary PromQL set matching against real device series.
local baselineVector =
  if std.length(models) == 0 then
    // No entries configured yet. Still valid PromQL, and always empty, so the
    // dashboard loads sanely rather than erroring on an empty baseline file.
    'vector(1) unless vector(1)'
  else
    std.join('\nor\n', [
      'label_replace(label_replace(vector(1), "sam_model", "%s", "", ""), "latest_version", "%s", "", "")'
      % [escape(model), escape(baseline[model])]
      for model in models
    ]);

// Renamed so its label lines up with the exporter metrics' `version` for the
// `unless` match below.
local baselineAsVersion =
  'label_replace(%s, "version", "$1", "latest_version", "(.*)")' % baselineVector;

local filter = '{sam_campus=~"$campus", sam_building=~"$building", sam_asset_type=~"$asset_type"}';

// Every vendor metric that carries a device's installed firmware as a
// `version` label. A device reports through exactly one of these (its own
// vendor's exporter), so the union has at most one row per hostname.
local firmwareInfo = 'extron_firmware_info or pearl_system_info';

// Every device that reports a firmware version, with SAM's inventory labels
// attached. group_left(version) is needed because vector matching drops
// unmatched labels from the right-hand side by default.
local reportedFirmware =
  'sam_asset_info%s * on (sam_hostname) group_left(version) (%s)' % [filter, firmwareInfo];

// (model, version) pairs not present in the baseline's (model, latest_version)
// set, restricted to models that actually have a baseline entry.
local outdated = |||
  (%(reported)s unless on (sam_model, version) %(baselineAsVersion)s)
  and on (sam_model) (%(baselineVector)s)
||| % { reported: reportedFirmware, baselineAsVersion: baselineAsVersion, baselineVector: baselineVector };

// outdated's rows already have everything except latest_version — group_left
// it in from baselineVector, keyed on sam_model like the unless/and above.
// This has to happen in PromQL, not as a Grafana table join: sam_model is not
// unique per device, so joining two independent queries on it at the
// table-transform level collapses every device sharing a model into one row
// instead of fanning the model's single baseline value out across each of
// them. group_left does that fan-out correctly because it operates on the
// actual per-series match, not a merge keyed only on the display column.
local outdatedWithLatest =
  '(%s) * on (sam_model) group_left(latest_version) (%s)' % [outdated, baselineVector];

sam.dashboard(
  uid='sam-firmware',
  title='SAM — Firmware',
  description=|||
    Firmware versions across the fleet, and which devices are behind.

    "Behind" is judged against ops/jsonnet/lib/firmware-baseline.libsonnet, a
    hand-maintained list of the latest known-good version per model — not a
    live signal from any vendor. A model with no entry in that file does not
    appear in the "Needs update" table; it is unmaintained, not compliant.

    Devices with no firmware API (blackbox-probed) never report a version and
    are absent from both tables.
  |||,
  variables=[
    sam.labelVar('campus', 'Campus', 'sam_asset_info', 'sam_campus'),
    sam.labelVar('building', 'Building', 'sam_asset_info', 'sam_building'),
    sam.labelVar('asset_type', 'Asset type', 'sam_asset_info', 'sam_asset_type'),
  ],
  groups=[
    sam.row('Firmware breakdown'),
    [
      sam.table(
        'Deployed firmware, by type and model',
        targets=[{ expr: 'count by (sam_asset_type, sam_model, version) (%s)' % reportedFirmware }],
        joinField='sam_model',
        rename={
          sam_asset_type: 'Type',
          sam_model: 'Model',
          version: 'Firmware version',
          Value: 'Devices',
        },
        order=['sam_asset_type', 'sam_model', 'version', 'Value'],
        sortBy=[{ displayName: 'Type', desc: false }],
        h=12,
        description='Every firmware version currently reported in the fleet, grouped by asset type and model.',
      ),
    ],

    sam.row('Needs update'),
    [
      sam.table(
        'Devices behind the configured baseline',
        targets=[{ expr: outdatedWithLatest }],
        joinField='sam_hostname',
        rename={
          sam_hostname: 'Hostname',
          sam_fi_number: 'FI number',
          sam_location_name: 'Room',
          sam_asset_type: 'Type',
          sam_model: 'Model',
          version: 'Installed version',
          latest_version: 'Latest version',
        },
        order=[
          'sam_hostname',
          'sam_fi_number',
          'sam_location_name',
          'sam_asset_type',
          'sam_model',
          'version',
          'latest_version',
        ],
        hidden=['Value'],
        sortBy=[{ displayName: 'Type', desc: false }],
        overrides=[
          sam.overrideByName('Hostname', [
            {
              id: 'links',
              value: [sam.dataLink('Device detail', '/d/sam-device/device?var-hostname=${__value.text}')],
            },
          ]),
          sam.overrideByName('FI number', [
            {
              id: 'links',
              value: [sam.dataLink('Room detail', '/d/sam-room/room?var-fi_number=${__value.text}')],
            },
          ]),
        ],
        h=12,
        description='Installed version does not match the baseline for that model. Empty means nothing is behind — or no baseline is configured yet.',
      ),
    ],
  ],
)

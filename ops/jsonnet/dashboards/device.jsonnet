// Device detail — one asset.
//
// Reached from the room table, or straight from SAM's asset page:
//
//   /d/sam-device/device?var-hostname=rec9092001.private.ugent.be
//
// Conditional rows
// ----------------
// Grafana has no "show this row only if the device exposes these metrics", so
// each vendor row repeats over a hidden variable that resolves to one value when
// the metric family is present and none when it is not — repeating zero times is
// the closest equivalent to hiding.
//
// The cost is that each family must be named here. Adding a type means adding an
// existsVar plus a row; see the Recorder pair below as the template. A fully
// generic version is not achievable without a Grafana plugin, and empty panels
// for every device that lacks a family would be worse.

local sam = import '../lib/sam.libsonnet';

local dev = '{sam_hostname="$hostname"}';
local devSel = 'sam_hostname="$hostname"';

sam.dashboard(
  uid='sam-device',
  title='SAM — Device',
  description=|||
    Detail for a single monitored asset.

    A device that is not answering reports nothing beyond its probe result, so
    the firmware and vendor panels go blank rather than showing values last seen
    hours ago.
  |||,
  variables=[
    sam.singleVar('hostname', 'Device', 'sam_asset_info', 'sam_hostname'),
    // Presence tests driving the conditional rows below.
    sam.existsVar('has_recorder', 'pearl_recording_active', devSel),
    sam.existsVar('has_projector', 'projector_lamp_hours', devSel),
  ],
  groups=[
    [
      sam.stat(
        'State',
        sam.stateExpr(devSel),
        w=4,
        h=4,
        mappings=sam.stateMappings,
        thresholds=null,
      ),
      sam.stat(
        'Firmware version',
        // A label matcher can't apply to a parenthesized union directly, so it
        // has to be repeated on each vendor metric rather than wrapped once.
        'extron_firmware_info{%(sel)s} or pearl_system_info{%(sel)s}' % { sel: devSel },
        w=10,
        h=4,
        // The value is always 1; the version lives in a label, so render the
        // series name rather than the number. Read straight from the exporter —
        // there is no baseline in SAM to compare against, just what is installed.
        legend='{{version}}',
        textMode='name',
        noValue='not reported',
        description='Installed version, as reported by the exporter. "not reported" means the device has no API, or has not answered.',
      ),
      sam.stat(
        'Type',
        'sam_asset_info%s' % dev,
        w=4,
        h=4,
        legend='{{sam_asset_type}} — {{sam_model}}',
        textMode='name',
      ),
      sam.stat(
        'Room',
        'sam_asset_info%s' % dev,
        w=3,
        h=4,
        legend='{{sam_location_name}} ({{sam_fi_number}})',
        textMode='name',
      ),
      sam.stat(
        'Criticality',
        'sam_asset_info%s' % dev,
        w=3,
        h=4,
        legend='{{sam_criticality}}',
        textMode='name',
        noValue='unclassified',
        description='Effective value: per-asset override, else the asset type default. Unclassified is a NIS2 gap.',
      ),
    ],
    [
      sam.timeseries(
        'Reachability',
        [{ expr: 'max by (sam_hostname) (probe_success%s)' % dev, legend: 'probe_success' }],
        w=12,
        h=7,
        min=0,
        max=1,
        description='1 = answered, 0 = probed and failed. Gaps mean no probe ran at all.',
      ),
      sam.timeseries(
        'Probe duration',
        [{ expr: 'max by (sam_hostname) (probe_duration_seconds%s)' % dev, legend: 'duration' }],
        w=12,
        h=7,
        unit='s',
        min=0,
      ),
    ],

    // ── Conditional: recorders ────────────────────────────────────────────────
    sam.row('Recorder', repeat='has_recorder'),
    [
      sam.timeseries(
        'Recording active',
        [{ expr: 'pearl_recording_active%s' % dev, legend: 'recording' }],
        w=8,
        h=7,
        min=0,
        max=1,
      ),
      sam.timeseries(
        'Free disk',
        [{ expr: 'pearl_disk_free_bytes%s' % dev, legend: 'free' }],
        w=8,
        h=7,
        unit='bytes',
        min=0,
      ),
      sam.stat(
        'Channels',
        'pearl_channel_count%s' % dev,
        w=8,
        h=7,
      ),
    ],

    // ── Conditional: projectors ───────────────────────────────────────────────
    sam.row('Projector', repeat='has_projector'),
    [
      sam.timeseries(
        'Lamp hours',
        [{ expr: 'projector_lamp_hours%s' % dev, legend: 'hours' }],
        w=12,
        h=7,
        unit='h',
        min=0,
      ),
      sam.timeseries(
        'Input signal present',
        [{ expr: 'projector_input_active%s' % dev, legend: 'input' }],
        w=12,
        h=7,
        min=0,
        max=1,
      ),
    ],

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    sam.row('Lifecycle'),
    [
      sam.stat(
        'End of support',
        'sam_asset_end_of_support_timestamp%s * 1000' % dev,
        w=6,
        h=4,
        unit='dateTimeAsIso',
        noValue='not set',
        description='Not set is itself a NIS2 gap — unsupported equipment needs a documented plan.',
      ),
      sam.stat(
        'Days until end of support',
        '(sam_asset_end_of_support_timestamp%s - time()) / 86400' % dev,
        w=6,
        h=4,
        unit='d',
        thresholds=[
          { color: 'red', value: null },
          { color: 'orange', value: 0 },
          { color: 'green', value: 365 },
        ],
        noValue='unknown',
      ),
    ],
  ],
)

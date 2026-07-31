// Minimal Grafana dashboard library for SAM.
//
// Deliberately not Grafonnet: three dashboards do not justify vendoring a large
// generated library, and this has no external dependencies — `jsonnet` alone
// builds it. Swap in Grafonnet later if the dashboard count grows.
//
// Grafana migrates older schemaVersions forward on load, so the emitted JSON
// stays loadable across Grafana upgrades.

{
  local sam = self,

  // ── Datasource ─────────────────────────────────────────────────────────────
  // Panels reference the dashboard's datasource *variable* rather than a UID,
  // so the same JSON provisions unchanged on any Grafana instance.
  ds:: { type: 'prometheus', uid: '${datasource}' },

  // ── Template variables ─────────────────────────────────────────────────────
  datasourcePicker:: {
    name: 'datasource',
    label: 'Data source',
    type: 'datasource',
    query: 'prometheus',
    refresh: 1,
    hide: 0,
    regex: '',
    current: {},
  },

  // `label_values` over sam_asset_info: the expected set, so a room appears in
  // the picker even when none of its devices are currently reporting.
  labelVar(name, label, metric, labelName):: {
    name: name,
    label: label,
    type: 'query',
    datasource: sam.ds,
    definition: 'label_values(%s, %s)' % [metric, labelName],
    query: 'label_values(%s, %s)' % [metric, labelName],
    refresh: 2,
    sort: 1,
    multi: true,
    includeAll: true,
    allValue: '.*',
    current: { selected: true, text: ['All'], value: ['$__all'] },
    options: [],
    hide: 0,
  },

  // ── Layout ─────────────────────────────────────────────────────────────────
  // Panels declare w/h; rows are laid out left to right. A groups entry that is
  // an object (rather than an array) is treated as a row header.
  // Panel ids are assigned sequentially and must stay stable: SAM embeds panels
  // as /d-solo/<uid>?panelId=<id>, so reordering panels re-points every embed.
  // Append new panels at the end of a row rather than inserting.
  layout(groups)::
    local place(acc, group) =
      if std.isObject(group) then
        {
          y: acc.y + 1,
          n: acc.n + 1,
          out: acc.out + [group { id: acc.n, gridPos: { h: 1, w: 24, x: 0, y: acc.y } }],
        }
      else
        local maxh = std.foldl(function(m, p) std.max(m, p.h), group, 0);
        local xs = std.foldl(function(a, p) a + [a[std.length(a) - 1] + p.w], group, [0]);
        {
          y: acc.y + maxh,
          n: acc.n + std.length(group),
          out: acc.out + std.mapWithIndex(
            function(i, p) sam.finish(p) {
              id: acc.n + i,
              gridPos: { h: p.h, w: p.w, x: xs[i], y: acc.y },
            },
            group
          ),
        };
    std.foldl(place, groups, { y: 0, n: 1, out: [] }).out,

  // Strip the layout-only fields before emitting.
  finish(p):: {
    [k]: p[k]
    for k in std.objectFields(p)
    if k != 'w' && k != 'h'
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  dashboard(uid, title, description, groups, variables=[], tags=['sam'], refresh='1m'):: {
    uid: uid,
    title: title,
    description: description,
    tags: tags,
    schemaVersion: 39,
    version: 1,
    // Provisioned dashboards are read-only in the UI; git is the source of truth.
    editable: false,
    graphTooltip: 1,
    timezone: 'browser',
    refresh: refresh,
    time: { from: 'now-24h', to: 'now' },
    timepicker: {},
    annotations: { list: [] },
    templating: { list: [sam.datasourcePicker] + variables },
    panels: sam.layout(groups),
  },

  // ── Panels ─────────────────────────────────────────────────────────────────
  target(expr, legend='', refId='A', instant=false):: {
    datasource: sam.ds,
    expr: expr,
    refId: refId,
    legendFormat: legend,
    instant: instant,
    range: !instant,
    editorMode: 'code',
  },

  // Ordered refIds so callers can pass a plain list of exprs.
  refIds:: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],

  stat(title, expr, w=4, h=4, unit='short', thresholds=null, description='', links=[], mappings=[], legend='', textMode='auto', noValue=null):: {
    type: 'stat',
    title: title,
    description: description,
    w: w,
    h: h,
    datasource: sam.ds,
    // textMode='name' renders the legend rather than the number, which is how a
    // label-carrying series (device_firmware_info{version="…"}) is displayed.
    targets: [sam.target(expr, legend, instant=true)],
    links: links,
    fieldConfig: {
      defaults: {
        unit: unit,
        decimals: 0,
        mappings: mappings,
        [if noValue != null then 'noValue']: noValue,
        color: { mode: if thresholds == null then 'fixed' else 'thresholds' },
        thresholds: {
          mode: 'absolute',
          steps: if thresholds == null
          then [{ color: 'text', value: null }]
          else thresholds,
        },
      },
      overrides: [],
    },
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      colorMode: 'value',
      graphMode: 'none',
      textMode: textMode,
      justifyMode: 'auto',
      orientation: 'auto',
    },
  },

  // ── Field overrides, mappings and links ────────────────────────────────────
  overrideByName(name, properties):: {
    matcher: { id: 'byName', options: name },
    properties: properties,
  },

  /** Opens another dashboard from a table cell or stat. */
  dataLink(title, url):: { title: title, url: url, targetBlank: false },

  /**
   * Reporting state as a single 0/1/2/absent column, mapped to words.
   *
   * A device in maintenance and a device that was never scraped both have no
   * probe series, so a bare probe_success cannot tell them apart — the query in
   * `stateExpr` folds maintenance in as 2 to keep them distinct.
   */
  stateMappings:: [
    {
      type: 'value',
      options: {
        '1': { text: 'Reporting', color: 'green', index: 0 },
        '0': { text: 'Not reporting', color: 'red', index: 1 },
        '2': { text: 'Maintenance', color: 'blue', index: 2 },
      },
    },
    {
      type: 'special',
      options: {
        match: 'null',
        result: { text: 'Never scraped', color: 'orange', index: 3 },
      },
    },
  ],

  /**
   * 1 = reporting, 0 = probed and failed, 2 = room in maintenance,
   * no series = never scraped.
   *
   * `or` prefers its left operand, and a device in maintenance is pulled from
   * service discovery so it never has a probe series — the two sides cannot
   * both match the same host.
   */
  stateExpr(selector):: |||
    max by (sam_hostname) (probe_success{%(sel)s})
    or
    (sam_asset_maintenance and on (sam_hostname) sam_asset_info{%(sel)s}) * 2
  ||| % { sel: selector },

  timeseries(title, targets, w=12, h=8, unit='short', min=null, max=null, description='', legend='list'):: {
    type: 'timeseries',
    title: title,
    description: description,
    w: w,
    h: h,
    datasource: sam.ds,
    targets: std.mapWithIndex(
      function(i, t) sam.target(t.expr, if std.objectHas(t, 'legend') then t.legend else '', sam.refIds[i]),
      targets
    ),
    fieldConfig: {
      defaults: {
        unit: unit,
        min: min,
        max: max,
        custom: {
          drawStyle: 'line',
          lineWidth: 2,
          fillOpacity: 8,
          showPoints: 'never',
          spanNulls: false,
        },
      },
      overrides: [],
    },
    options: {
      legend: { displayMode: legend, placement: 'bottom', showLegend: true, calcs: [] },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
  },

  barGauge(title, expr, legend='{{label}}', w=8, h=8, unit='short', description=''):: {
    type: 'bargauge',
    title: title,
    description: description,
    w: w,
    h: h,
    datasource: sam.ds,
    targets: [sam.target(expr, legend, instant=true)],
    fieldConfig: {
      defaults: {
        unit: unit,
        decimals: 0,
        color: { mode: 'fixed', fixedColor: 'blue' },
        thresholds: { mode: 'absolute', steps: [{ color: 'blue', value: null }] },
      },
      overrides: [],
    },
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      displayMode: 'gradient',
      orientation: 'horizontal',
      showUnfilled: true,
      valueMode: 'text',
    },
  },

  // Columns the Prometheus table format contributes that we never want to show.
  // Each query adds its own, suffixed with the query's position when duplicated.
  tableNoise(queryCount):: ['Time', '__name__'] + std.flattenArrays([
    ['Time %d' % i, '__name__ %d' % i]
    for i in std.range(1, queryCount)
  ]),

  // Instant queries joined on a shared label into one table.
  //
  // Keep exactly one query carrying the display labels and aggregate the rest
  // down to the join key alone (`sum by (joinField)`), which also strips
  // __name__. Otherwise every query contributes its own copy of every label and
  // the column names depend on join ordering.
  //
  // `order` and `rename` are keyed on the *original* field names — Grafana's
  // organize transform resolves both against the pre-rename names.
  table(title, targets, joinField, rename, order, w=24, h=10, description='', hidden=[], sortBy=null, noValue=null, overrides=[]):: {
    type: 'table',
    title: title,
    description: description,
    w: w,
    h: h,
    datasource: sam.ds,
    targets: std.mapWithIndex(
      function(i, t) sam.target(t.expr, '', sam.refIds[i], instant=true) { format: 'table' },
      targets
    ),
    transformations: [
      { id: 'joinByField', options: { byField: joinField, mode: 'outer' } },
      {
        id: 'organize',
        options: {
          excludeByName: {
            [n]: true
            for n in sam.tableNoise(std.length(targets)) + hidden
          },
          renameByName: rename,
          indexByName: {
            [order[i]]: i
            for i in std.range(0, std.length(order) - 1)
          },
        },
      },
    ],
    fieldConfig: {
      defaults: {
        // An aggregated query returns no series for a room with nothing to
        // report, so an outer join leaves the cell empty. Show it as 0.
        [if noValue != null then 'noValue']: noValue,
        custom: { align: 'auto', cellOptions: { type: 'auto' }, filterable: true },
      },
      overrides: overrides,
    },
    options: {
      showHeader: true,
      cellHeight: 'sm',
      sortBy: if sortBy == null then [] else sortBy,
      footer: { show: false, reducer: ['sum'], countRows: false, fields: '' },
    },
  },

  // `repeat` names a variable the row repeats over. Pointed at a variable that
  // resolves to one value or none, it becomes a *conditional* row — Grafana has
  // no native "show this row only if the device exposes these metrics", and
  // repeating zero times is the closest equivalent.
  row(title, repeat=null):: {
    type: 'row',
    title: title,
    collapsed: false,
    panels: [],
    [if repeat != null then 'repeat']: repeat,
  },

  /**
   * Hidden variable that yields exactly one value when `metric` exists for the
   * selector, and none otherwise. Drives conditional rows.
   */
  existsVar(name, metric, selector):: {
    name: name,
    label: name,
    type: 'query',
    datasource: sam.ds,
    definition: 'label_values(%s{%s}, sam_hostname)' % [metric, selector],
    query: 'label_values(%s{%s}, sam_hostname)' % [metric, selector],
    refresh: 2,
    sort: 1,
    multi: false,
    includeAll: false,
    // Hidden: it is a presence test, not something to pick from.
    hide: 2,
    current: {},
    options: [],
  },

  /** Single-select variable, for the one room or device a dashboard is about. */
  singleVar(name, label, metric, labelName):: {
    name: name,
    label: label,
    type: 'query',
    datasource: sam.ds,
    definition: 'label_values(%s, %s)' % [metric, labelName],
    query: 'label_values(%s, %s)' % [metric, labelName],
    refresh: 2,
    sort: 1,
    multi: false,
    includeAll: false,
    current: {},
    options: [],
    hide: 0,
  },

  // ── Shared threshold sets ──────────────────────────────────────────────────
  // "any is bad" — green at zero, red as soon as one appears.
  thresholdsAnyIsBad:: [{ color: 'green', value: null }, { color: 'red', value: 1 }],
  thresholdsAnyIsWarn:: [{ color: 'green', value: null }, { color: 'orange', value: 1 }],
  thresholdsNeutral:: [{ color: 'text', value: null }],
  // Availability ratio: red below 90%, amber below 99%.
  thresholdsRatio:: [
    { color: 'red', value: null },
    { color: 'orange', value: 0.9 },
    { color: 'green', value: 0.99 },
  ],
}

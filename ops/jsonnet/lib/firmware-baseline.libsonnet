// Latest known-good firmware version per model, maintained by hand.
//
// Keys must match sam_model exactly as it appears in SAM (Asset.model — free
// text; check the "Model" column on the sam-firmware dashboard for the exact
// spelling reported by a given device). Update this file whenever a vendor
// ships a new release: ops/jsonnet/build.sh picks it up on the next build,
// nothing else needs touching.
//
// This is deliberately separate from SAM itself. SAM's own FirmwareBaseline
// feature (in-app, database-backed) was removed by a prior decision — see the
// "no approved-firmware baseline anywhere in this system" note in
// dashboards/fleet.jsonnet. This file only feeds the sam-firmware Grafana
// dashboard; it is ops-only config, not a SAM feature, and nothing in the app
// reads it.
{
  // 'Poly Studio X30': '6.2.1',
  'TLP Pro 725T': '3.14.0000-b003',
  'TLP Pro 1025T': '3.14.0000-b003',
  'IPCP Pro 250': '3.18.0001-b002',
  'IPCP Pro 255': '3.18.0001-b002',
  'IPCP Pro 255Q xi': '1.14.0000-b010',
  'IPCP Pro 360Q xi': '1.14.0000-b010',
  'IN1804': '1.10.0001-b001',
  'IN1804 DO': '1.10.0001-b001',
  'IN1804 HD': '1.10.0001-b001',
  'DTP3 IN2004 DO': '1.02.0003-b005',
  'Pearl Mini': '4.24.6'
}

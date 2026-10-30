/**
 * scripts/resolve-ip-hostnames.mjs
 *
 * One-off migration helper. Older imports left raw IP addresses in the
 * Asset.hostname field. This script finds every asset whose hostname is a
 * bare IPv4/IPv6 address, performs a reverse-DNS (PTR) lookup, and rewrites
 * the hostname to the resolved FQDN.
 *
 * Assets whose IP has no PTR record (or whose PTR resolves back to the same
 * IP) are left untouched and reported as "unresolved".
 *
 * Usage:
 *   node --import tsx/esm scripts/resolve-ip-hostnames.mjs                  # resolve all IP hostnames
 *   node --import tsx/esm scripts/resolve-ip-hostnames.mjs --dry-run        # preview, no writes
 *   node --import tsx/esm scripts/resolve-ip-hostnames.mjs --asset-id <id>  # single asset
 *   node --import tsx/esm scripts/resolve-ip-hostnames.mjs --dns-server 10.0.0.1   # override resolver(s), comma-separated
 *   node --import tsx/esm scripts/resolve-ip-hostnames.mjs --timeout 8000   # per-lookup timeout in ms (default 5000)
 *
 * Run from the project root so that the .env file is found automatically.
 */

import { isIP } from "node:net";
import dns from "node:dns/promises";
import "./_env.mjs";
import { prisma } from "@/lib/prisma";

// ── arg parsing ───────────────────────────────────────────────────────────────

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun = process.argv.includes("--dry-run");
const singleAssetId = getArg("--asset-id");
const dnsServers = getArg("--dns-server");
const timeoutMs = Number(getArg("--timeout", "5000"));

if (dnsServers) {
  dns.setServers(dnsServers.split(",").map((s) => s.trim()).filter(Boolean));
}

// ── reverse DNS with timeout ───────────────────────────────────────────────────

/**
 * Returns the first PTR hostname for an IP, normalised (lowercase, no trailing
 * dot), or null if there is no usable record. Never throws — DNS failures
 * (NXDOMAIN, timeout, SERVFAIL) resolve to null so the run continues.
 */
async function reverseLookup(ip) {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
    const name = names?.[0]?.trim().replace(/\.$/, "").toLowerCase();
    if (!name || isIP(name)) return null; // empty or PTR points back to an IP
    return name;
  } catch {
    return null;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nSAM — Resolve IP hostnames");
  console.log("─────────────────────────────────────────");
  console.log(`  Dry run      : ${dryRun ? "YES (no changes will be made)" : "no"}`);
  console.log(`  DNS servers  : ${dnsServers ?? "system default"}`);
  console.log(`  Timeout (ms) : ${timeoutMs}`);
  if (singleAssetId) console.log(`  Target asset : ${singleAssetId}`);
  console.log("");

  const where = { hostname: { not: null } };
  if (singleAssetId) where.id = singleAssetId;

  const assets = await prisma.asset.findMany({
    where,
    select: { id: true, hostname: true },
    orderBy: { hostname: "asc" },
  });

  // Keep only assets whose hostname is a bare IP address.
  const ipAssets = assets.filter((a) => isIP(a.hostname) !== 0);

  if (ipAssets.length === 0) {
    console.log("No assets with an IP address in the hostname field.");
    return;
  }

  console.log(`Found ${ipAssets.length} asset(s) with an IP hostname.\n`);

  let resolved = 0;
  let unresolved = 0;
  let errors = 0;

  for (const asset of ipAssets) {
    const ip = asset.hostname;
    const fqdn = await reverseLookup(ip);

    if (!fqdn) {
      console.log(`  ?  ${ip} — no PTR record, left unchanged`);
      unresolved++;
      continue;
    }

    if (dryRun) {
      console.log(`  WOULD UPDATE  ${ip} → ${fqdn}`);
      resolved++;
      continue;
    }

    try {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { hostname: fqdn },
      });
      console.log(`  ✓  ${ip} → ${fqdn}`);
      resolved++;
    } catch (err) {
      console.error(`  ✗  ${ip} (asset ${asset.id}) — ${err.message}`);
      errors++;
    }
  }

  console.log("\n─────────────────────────────────────────");
  if (dryRun) {
    console.log(`  Would update : ${resolved}`);
    console.log(`  Unresolved   : ${unresolved}`);
  } else {
    console.log(`  Updated     : ${resolved}`);
    console.log(`  Unresolved  : ${unresolved}`);
    console.log(`  Errors      : ${errors}`);
  }
  console.log("");

  if (errors > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

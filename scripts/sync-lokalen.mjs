/**
 * scripts/sync-lokalen.mjs
 *
 * Crawls https://lokalen.ugent.be/lokaal/{fiNumber} for every SAM location
 * that has a fiNumber, then:
 *   - Corrects the location name if it differs from the portal (always synced)
 *   - Corrects the parent building + campus names when they differ from the
 *     portal, and fills in their derived FI numbers (always synced).
 *     Campus FI = first group + zeroes; building FI = first two groups + zeroes.
 *   - Fills in address/city/country ONLY when those fields are currently empty
 *   - Downloads photos and saves them as file attachments ONLY if the location
 *     has no existing image attachments yet
 *   - Sets the first downloaded photo as cover image if none is set
 *
 * Existing address data and existing images are never overwritten.
 * Use --force to re-download images even when images already exist.
 *
 * Usage:
 *   node --import tsx/esm scripts/sync-lokalen.mjs                           # all locations
 *   node --import tsx/esm scripts/sync-lokalen.mjs --dry-run                 # preview, no writes
 *   node --import tsx/esm scripts/sync-lokalen.mjs --fi-number 14.10.100.013 # single location
 *   node --import tsx/esm scripts/sync-lokalen.mjs --skip-images             # metadata only
 *   node --import tsx/esm scripts/sync-lokalen.mjs --force                   # re-download existing images
 *   node --import tsx/esm scripts/sync-lokalen.mjs --user-id <id>            # attachment owner (default: first ADMIN)
 *   node --import tsx/esm scripts/sync-lokalen.mjs --debug                   # dump raw HTML + selector matches
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { prisma } from "@/lib/prisma";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { JSDOM } from "jsdom";
import { mkdir, writeFile } from "fs/promises";
import { resolve, dirname, basename } from "path";
import { randomUUID } from "crypto";

// ── Field label → value mapping ──────────────────────────────────────────────
// lokalen.ugent.be uses Bootstrap form-groups with a <label class="control-label">
// and a sibling <div class="label-field-col"> for each data field.
// We look up fields by their label text (case-insensitive).
const FIELD_LABELS = {
  name:    "name",
  address: "address",
};
// Photos are served as /foto/{id} paths; all other <img> are UI chrome.
const IMAGE_SRC_PATTERN = /\/foto\//;

const PORTAL_BASE  = "https://lokalen.ugent.be";
const RATE_LIMIT_MS = 150;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MIME_TO_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };

// ── arg parsing ──────────────────────────────────────────────────────────────
function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun      = process.argv.includes("--dry-run");
const debug       = process.argv.includes("--debug");
const skipImages  = process.argv.includes("--skip-images");
const force       = process.argv.includes("--force");
const fiNumberArg = getArg("--fi-number");
const userIdArg   = getArg("--user-id");

// ── storage ──────────────────────────────────────────────────────────────────
const useS3 = process.env.STORAGE_DRIVER === "s3" && !!process.env.S3_BUCKET;

let s3 = null;
if (useS3) {
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    try { new URL(endpoint); } catch {
      console.error(`❌  S3_ENDPOINT="${endpoint}" is not a valid URL. Add the protocol, e.g. https://${endpoint}`);
      process.exit(1);
    }
  }
  s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    ...(endpoint ? { endpoint }                                                             : {}),
    ...(process.env.S3_FORCE_PATH_STYLE === "true" ? { forcePathStyle: true }             : {}),
  });
}

async function putObject(key, buffer, contentType) {
  if (useS3) {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      ServerSideEncryption: "AES256",
    }));
  } else {
    const uploadRoot = resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");
    const fullPath   = resolve(uploadRoot, key);
    if (!fullPath.startsWith(uploadRoot + "/")) throw new Error(`Path traversal detected: ${key}`);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
  }
}

// ── HTTP with cookie jar ─────────────────────────────────────────────────────
// lokalen.ugent.be (Apache Wicket) sets JSESSIONID on first request and
// requires it on subsequent requests. Node's native fetch doesn't persist
// cookies across redirects, so we follow redirects manually with a cookie jar.

const USER_AGENT = "SAM-Sync/1.0 (UGent internal asset management)";

function parseCookies(headers) {
  const cookies = {};
  const raw = headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return cookies;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchPage(url, timeoutMs = 15_000) {
  const jar = {};
  let current = url;
  let hops = 0;

  while (hops < 10) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });

    Object.assign(jar, parseCookies(res.headers));

    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, text: await res.text(), jar };
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect with no Location header from ${current}`);
      current = new URL(loc, current).href;
      hops++;
      continue;
    }
    return { ok: false, status: res.status, text: "", jar };
  }
  throw new Error(`Redirect count exceeded for ${url}`);
}

async function fetchImage(url, jar, timeoutMs = 30_000) {
  // /foto/* endpoints use the same Wicket session-cookie redirect pattern.
  // Follow redirects manually so the cookie jar is sent on every hop.
  let current = url;
  const localJar = { ...jar };
  for (let hops = 0; hops < 10; hops++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, ...(Object.keys(localJar).length ? { Cookie: cookieHeader(localJar) } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    Object.assign(localJar, parseCookies(res.headers));
    if (res.status >= 200 && res.status < 300) return res;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect with no Location header from ${current}`);
      current = new URL(loc, current).href;
      continue;
    }
    return res;
  }
  throw new Error(`Redirect count exceeded for ${url}`);
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

// Finds the value for a labeled form field.
// The site structure is: .form-group > [label.control-label text] + .label-field-col
function extractFormField(document, labelText) {
  for (const group of document.querySelectorAll(".form-group")) {
    const label = group.querySelector("label.control-label");
    if (label?.textContent?.trim().toLowerCase() === labelText.toLowerCase()) {
      return group.querySelector(".label-field-col")?.textContent?.trim() ?? null;
    }
  }
  return null;
}

function extractImageUrls(document, pageUrl) {
  return [...document.querySelectorAll("img")]
    .map(img => {
      const src = img.getAttribute("src");
      if (!src || !IMAGE_SRC_PATTERN.test(src)) return null;
      try { return new URL(src, pageUrl).href; } catch { return null; }
    })
    .filter(Boolean)
    .filter((url, i, arr) => arr.indexOf(url) === i);
}

// Walk up the location tree and return ancestor records ordered from direct parent to root.
async function loadAncestors(locationId) {
  const ancestors = [];
  let current = await prisma.location.findUnique({ where: { id: locationId }, select: { parentId: true } });
  while (current?.parentId) {
    const parent = await prisma.location.findUnique({
      where: { id: current.parentId },
      select: { id: true, name: true, fiNumber: true, parentId: true },
    });
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

// Derive the building + campus FI numbers from a room's fiNumber.
// Format is dot-separated groups (e.g. "14.10.100.013"):
//   campus   = first group, remaining groups zeroed → "14.00.000.000"
//   building = first two groups, remaining groups zeroed → "14.10.000.000"
function deriveAncestorFiNumbers(fiNumber) {
  const parts = (fiNumber ?? "").split(".");
  if (parts.length < 3) return null;
  const zero = (s) => "0".repeat(s.length);
  return {
    campusFi:   [parts[0], ...parts.slice(1).map(zero)].join("."),
    buildingFi: [parts[0], parts[1], ...parts.slice(2).map(zero)].join("."),
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\nSAM — Sync lokalen.ugent.be");
  console.log("─────────────────────────────────────────");
  console.log(`  Dry run     : ${dryRun ? "YES (no changes will be made)" : "no"}`);
  console.log(`  Skip images : ${skipImages}`);
  console.log(`  Force       : ${force}`);
  console.log(`  Storage     : ${useS3 ? "S3" : "local"}`);
  if (fiNumberArg) console.log(`  FI number   : ${fiNumberArg}`);
  console.log("");

  let uploadedById = userIdArg;
  if (!uploadedById && !skipImages && !dryRun) {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) {
      console.error("❌  No ADMIN user found. Provide --user-id to specify a user.");
      process.exit(1);
    }
    uploadedById = admin.id;
    console.log(`  Uploader    : ${admin.email} (${admin.id})\n`);
  }

  const where = { fiNumber: { not: null } };
  if (fiNumberArg) where.fiNumber = fiNumberArg;

  const locations = await prisma.location.findMany({
    where,
    select: { id: true, name: true, fiNumber: true, address: true, city: true, country: true, coverImageId: true },
    orderBy: { name: "asc" },
  });

  if (locations.length === 0) {
    console.log("No locations with fiNumber found.");
    return;
  }
  console.log(`Found ${locations.length} location(s) with fiNumber.\n`);

  let updated = 0, skipped = 0, errors = 0, totalImages = 0;

  for (const location of locations) {
    const pageUrl = `${PORTAL_BASE}/lokaal/${location.fiNumber}`;
    console.log(`  ${location.name}  (${location.fiNumber})`);

    let html, jar;
    try {
      const result = await fetchPage(pageUrl);
      if (!result.ok) {
        console.log(`    SKIP — HTTP ${result.status}\n`);
        skipped++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      html = result.text;
      jar  = result.jar;
    } catch (err) {
      console.error(`    ERROR fetching: ${err.message}\n`);
      errors++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const { document } = new JSDOM(html, { url: pageUrl }).window;

    if (debug) {
      console.log("\n    ── RAW HTML (first 3000 chars) ──────────────────────────────────");
      console.log(html.slice(0, 3000));
      console.log("    ─────────────────────────────────────────────────────────────────\n");
    }

    const scrapedFullName = extractFormField(document, FIELD_LABELS.name);
    const scrapedAddress  = extractFormField(document, FIELD_LABELS.address);

    // Portal name format: "{room}, {building}, {campus}"
    // Use only the first segment as the location name; verify the rest against ancestors.
    const nameParts     = scrapedFullName ? scrapedFullName.split(", ") : [];
    const scrapedName   = nameParts[0] ?? null;
    const ancestorHints = nameParts.slice(1); // e.g. ["Plateau - Rozier", "Campus Boekentoren"]

    if (debug) {
      console.log(`    name    → ${JSON.stringify(scrapedFullName)} → room: ${JSON.stringify(scrapedName)}`);
      if (ancestorHints.length) console.log(`    hints   → ${JSON.stringify(ancestorHints)}`);
      console.log(`    address → ${JSON.stringify(scrapedAddress)}`);
      const urls = extractImageUrls(document, pageUrl);
      console.log(`    images  → ${urls.length} found`);
      urls.forEach(u => console.log(`              ${u}`));
      console.log("");
    }

    // ── Metadata sync ────────────────────────────────────────────────────────
    const updates = {};

    if (scrapedName && scrapedName !== location.name) {
      console.log(`    name    : "${location.name}" → "${scrapedName}"`);
      updates.name = scrapedName;
    }
    // Address fields: only fill in when currently empty — never overwrite existing data
    if (scrapedAddress && !location.address) {
      console.log(`    address : "(empty)" → "${scrapedAddress}"`);
      updates.address = scrapedAddress;
    } else if (scrapedAddress && location.address && scrapedAddress !== location.address) {
      console.log(`    address : kept existing "${location.address}" (portal: "${scrapedAddress}")`);
    }
    if (!location.city) {
      console.log(`    city    : "(empty)" → "Gent"`);
      updates.city = "Gent";
    }
    if (!location.country) {
      console.log(`    country : "(empty)" → "Belgium"`);
      updates.country = "Belgium";
    }

    if (Object.keys(updates).length > 0) {
      if (!dryRun) {
        try {
          await prisma.location.update({ where: { id: location.id }, data: updates });
        } catch (err) {
          console.error(`    ERROR updating metadata: ${err.message}`);
          errors++;
        }
      }
      updated++;
    } else if (!skipImages) {
      // will print changes from image section below, or "(no changes)"
    }

    // ── Ancestor (building + campus) sync ──────────────────────────────────────
    // Portal name format is "{room}, {building}, {campus}"; the matching ancestors
    // in the tree are the direct parent (building) and its parent (campus).
    // Correct their names when they differ and fill in derived FI numbers.
    if (ancestorHints.length > 0) {
      const ancestors = await loadAncestors(location.id);
      const derived   = deriveAncestorFiNumbers(location.fiNumber);

      // ancestorHints[0] ↔ ancestors[0] (building); ancestorHints[1] ↔ ancestors[1] (campus)
      const layers = [
        { label: "building", hint: ancestorHints[0], ancestor: ancestors[0], fiNumber: derived?.buildingFi },
        { label: "campus",   hint: ancestorHints[1], ancestor: ancestors[1], fiNumber: derived?.campusFi },
      ];

      for (const layer of layers) {
        if (!layer.hint || !layer.ancestor) continue;
        const ancUpdates = {};
        if (layer.hint !== layer.ancestor.name) {
          console.log(`    ${layer.label.padEnd(8)}: "${layer.ancestor.name}" → "${layer.hint}"`);
          ancUpdates.name = layer.hint;
        }
        if (layer.fiNumber && layer.fiNumber !== layer.ancestor.fiNumber) {
          console.log(`    ${layer.label.padEnd(8)}: fiNumber "${layer.ancestor.fiNumber ?? "(empty)"}" → "${layer.fiNumber}"`);
          ancUpdates.fiNumber = layer.fiNumber;
        }
        if (Object.keys(ancUpdates).length > 0) {
          if (!dryRun) {
            try {
              await prisma.location.update({ where: { id: layer.ancestor.id }, data: ancUpdates });
            } catch (err) {
              if (err.code === "P2002") {
                console.error(`    ERROR updating ${layer.label}: fiNumber "${ancUpdates.fiNumber}" already in use (P2002)`);
              } else {
                console.error(`    ERROR updating ${layer.label}: ${err.message}`);
              }
              errors++;
            }
          }
          updated++;
        }
      }
    }

    // ── Image sync ───────────────────────────────────────────────────────────
    if (!skipImages) {
      const imageUrls = extractImageUrls(document, pageUrl);

      // Check if location already has any image attachments — if so, skip download
      // entirely unless --force is passed. Existing images are never overwritten.
      const existingImageCount = await prisma.attachment.count({
        where: { locationId: location.id, mimeType: { startsWith: "image/" } },
      });
      const hasExistingImages = existingImageCount > 0;

      if (hasExistingImages && !force) {
        if (imageUrls.length > 0) {
          console.log(`    images  : skipped — location already has ${existingImageCount} image(s) (use --force to re-download)`);
        } else if (Object.keys(updates).length === 0) {
          console.log(`    (no changes)`);
        }
      } else {

      if (imageUrls.length === 0 && Object.keys(updates).length === 0) {
        console.log(`    (no changes)`);
      }

      if (imageUrls.length > 0) {
        const existingDescriptions = new Set(
          dryRun
            ? []
            : (await prisma.attachment.findMany({
                where: { locationId: location.id, attachmentType: "file" },
                select: { description: true },
              })).map(a => a.description)
        );

        let downloaded = 0, imgSkipped = 0;
        let firstNewAttachmentId = null;

        for (const imgUrl of imageUrls) {
          if (existingDescriptions.has(imgUrl) && !force) {
            imgSkipped++;
            continue;
          }

          if (dryRun) {
            console.log(`    WOULD DOWNLOAD  ${imgUrl}`);
            downloaded++;
            continue;
          }

          let imgBuffer, imgContentType;
          try {
            const imgRes = await fetchImage(imgUrl, jar);
            if (!imgRes.ok) {
              console.log(`    SKIP image — HTTP ${imgRes.status}: ${imgUrl}`);
              imgSkipped++;
              continue;
            }
            imgContentType = (imgRes.headers.get("content-type") ?? "").split(";")[0].trim();
            if (!ALLOWED_MIME_TYPES.has(imgContentType)) {
              console.log(`    SKIP image — unsupported type ${imgContentType}: ${imgUrl}`);
              imgSkipped++;
              continue;
            }
            imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          } catch (err) {
            console.error(`    ERROR fetching image (${imgUrl}): ${err.message}`);
            errors++;
            continue;
          }

          try {
            const ext          = MIME_TO_EXT[imgContentType] ?? ".jpg";
            const uuid         = randomUUID();
            const filename     = `${uuid}${ext}`;
            const relativePath = `locations/${location.id}/${filename}`;
            const originalName = basename(new URL(imgUrl).pathname).replace(/[\r\n"\\]/g, "") || filename;

            await putObject(relativePath, imgBuffer, imgContentType);

            const attachment = await prisma.attachment.create({
              data: {
                attachmentType: "file",
                filename,
                originalName,
                mimeType: imgContentType,
                size: imgBuffer.length,
                path: relativePath,
                description: imgUrl,
                locationId: location.id,
                uploadedById,
              },
            });

            if (!firstNewAttachmentId) firstNewAttachmentId = attachment.id;
            downloaded++;
            totalImages++;
          } catch (err) {
            console.error(`    ERROR storing image (${imgUrl}): ${err.message}`);
            errors++;
          }

          await sleep(50);
        }

        console.log(`    images  : ${downloaded} downloaded, ${imgSkipped} skipped`);

        // Set cover image if location has none and we downloaded at least one new image
        if (!dryRun && firstNewAttachmentId && !location.coverImageId) {
          try {
            await prisma.location.update({
              where: { id: location.id },
              data: { coverImageId: firstNewAttachmentId },
            });
            console.log(`    cover   : set to first new image`);
          } catch (err) {
            console.error(`    ERROR setting cover image: ${err.message}`);
          }
        } else if (dryRun && imageUrls.length > 0 && !location.coverImageId) {
          console.log(`    WOULD SET cover image`);
        }
      }
      } // end else (no existing images / force)
    }

    console.log("");
    await sleep(RATE_LIMIT_MS);
  }

  console.log("─────────────────────────────────────────");
  if (dryRun) {
    console.log(`  Would update : ${updated}`);
    console.log(`  Would skip   : ${skipped}`);
  } else {
    console.log(`  Updated  : ${updated}`);
    console.log(`  Skipped  : ${skipped}  (HTTP error or no data)`);
    console.log(`  Errors   : ${errors}`);
    if (!skipImages) console.log(`  Images   : ${totalImages} downloaded`);
  }
  console.log("");

  if (errors > 0) process.exit(1);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main()
  .catch(err => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

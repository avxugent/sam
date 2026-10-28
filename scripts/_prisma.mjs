/**
 * Shared Prisma client for maintenance scripts.
 *
 * Registers the tsx ESM loader so the TypeScript-only Prisma 7 generated
 * client (generated/prisma/client.ts) can be imported at runtime without a
 * separate compile step.  tsx uses esbuild under the hood and handles the
 * extension-less relative imports that the Prisma generator emits.
 *
 * Import this module instead of "@prisma/client" in all CLI scripts:
 *   import { prisma } from "./_prisma.mjs";
 */

import "./_env.mjs";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// The Prisma 7 client is generated as TypeScript source. Register the tsx
// loader so a plain `node scripts/<x>.mjs` invocation (e.g. a Nomad Action,
// which does not pass --import tsx/esm) can still import the .ts files.
await import("tsx/esm");

// Locate the generated client. Two valid layouts:
//   • dev      — <root>/generated/prisma   (../ from scripts/)
//   • Docker   — scripts/generated/prisma  (copied alongside scripts/node_modules)
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(here, "generated/prisma/client.ts"),     // Docker runner layout
  join(here, "../generated/prisma/client.ts"),  // dev / repo layout
];
const clientPath = candidates.find(existsSync) ?? candidates[1];

const { PrismaClient } = await import(pathToFileURL(clientPath).href);

// Same rule as lib/prisma.ts: never fall back to a default database.
if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) {
  throw new Error("Missing required database environment variables: DB_HOST, DB_NAME, DB_USER");
}

const adapter = new PrismaMariaDb({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT ?? "3306"),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

export const prisma = new PrismaClient({ adapter });

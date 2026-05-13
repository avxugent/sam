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
import { register } from "node:module";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Bootstrap tsx so subsequent dynamic imports can load .ts files
register("tsx/esm", import.meta.url);

const { PrismaClient } = await import("../generated/prisma/client.ts");

const adapter = new PrismaMariaDb({
  host:     process.env.DB_HOST     ?? "localhost",
  port:     Number(process.env.DB_PORT ?? "3306"),
  database: process.env.DB_NAME     ?? "samdb",
  user:     process.env.DB_USER     ?? "sam",
  password: process.env.DB_PASSWORD ?? "",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

export const prisma = new PrismaClient({ adapter });

/**
 * Loads .env into process.env (without overriding variables already set),
 * mirroring prisma.config.ts. Import it first in every CLI script: the
 * prisma client from lib/prisma.ts reads the DB_* vars on first use.
 */
import { existsSync, readFileSync } from "fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([^#\s=][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

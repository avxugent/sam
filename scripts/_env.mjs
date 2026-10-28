/**
 * Loads .env into process.env (without overriding variables already set),
 * mirroring prisma.config.ts. Import this before PrismaClient in any CLI
 * script; _prisma.mjs builds its MariaDB adapter from the DB_* vars.
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

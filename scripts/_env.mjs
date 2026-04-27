/**
 * Loads .env and constructs DATABASE_URL from DB_* vars, mirroring prisma.config.ts.
 * Import this before PrismaClient in any CLI script.
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

const host = process.env.DB_HOST ?? "localhost";
const port = process.env.DB_PORT ?? "3306";
const name = process.env.DB_NAME ?? "samdb";
const user = process.env.DB_USER ?? "sam";
const password = process.env.DB_PASSWORD ?? "";

let url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
if (process.env.DB_SSL === "true") url += "?sslaccept=strict";

process.env.DATABASE_URL = url;

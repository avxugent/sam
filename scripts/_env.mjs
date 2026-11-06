/**
 * Loads .env into process.env (without overriding variables already set),
 * like prisma.config.ts, with Node's own parser (quotes and `# comments`
 * handled the way Next.js reads the same file). Import it first in every
 * CLI script: the prisma client from lib/prisma.ts reads the DB_* vars on
 * first use.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

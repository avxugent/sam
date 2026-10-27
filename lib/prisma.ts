import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createAdapter(): PrismaMariaDb {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT ?? "3306");
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !database || !user) {
    throw new Error(
      "Missing required database environment variables: DB_HOST, DB_NAME, DB_USER"
    );
  }

  return new PrismaMariaDb({
    host,
    port,
    database,
    user,
    password,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: createAdapter(),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

/**
 * The shared PrismaClient, created on first use rather than at import time, so
 * importing this module (e.g. while `next build` collects routes) needs no
 * DB_* environment. A missing variable still fails loudly on the first query.
 * The singleton lives on globalThis so dev hot-reloads reuse one connection pool.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

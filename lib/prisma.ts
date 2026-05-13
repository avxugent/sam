import { PrismaClient } from "@prisma/client";
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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

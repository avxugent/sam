import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB_* for a local run come from .env (as in prisma.config.ts); variables
// already set (CI) win. The test workers inherit this environment.
if (existsSync(".env")) process.loadEnvFile(".env");

// Opt-in tests against a real MySQL (see __tests__/integration/). The real
// generated Prisma client can't be linked inside the vmForks pool used by the
// unit suite, so these run in plain forks in the node environment.
export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    include: ["__tests__/integration/**/*.int.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, ".") }],
  },
});

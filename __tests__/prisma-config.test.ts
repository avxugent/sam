import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { existsSync } from "node:fs";

const DB_VARS = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SSL"] as const;

async function loadConfig(env: Partial<Record<(typeof DB_VARS)[number], string>>) {
  for (const key of DB_VARS) vi.stubEnv(key, env[key] as string);
  vi.resetModules();
  return (await import("@/prisma.config")).default;
}

const REQUIRED = { DB_HOST: "localhost", DB_NAME: "samdb", DB_USER: "sam" };

// Keep the import side-effect free: never load the developer's .env into the test env.
const loadEnvFile = vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});

beforeEach(() => {
  loadEnvFile.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prisma.config.ts", () => {
  it("points at the schema and the committed migrations", async () => {
    const config = await loadConfig({});
    expect(config.schema).toBe("prisma/schema.prisma");
    expect(config.migrations?.path).toBe("prisma/migrations");
  });

  it("loads without DB_* vars (prisma generate) but throws once the URL is read", async () => {
    const config = await loadConfig({});
    expect(() => config.datasource?.url).toThrow("Missing required database environment variables: DB_HOST, DB_NAME, DB_USER");
    for (const missing of ["DB_HOST", "DB_NAME", "DB_USER"] as const) {
      const env = { ...REQUIRED, [missing]: "" };
      const partial = await loadConfig(env);
      expect(() => partial.datasource?.url, missing).toThrow("Missing required database environment variables");
    }
  });

  it("builds the URL from the DB_* vars", async () => {
    const config = await loadConfig({ DB_HOST: "db.internal", DB_PORT: "3307", DB_NAME: "inv", DB_USER: "app", DB_PASSWORD: "pw" });
    expect(config.datasource?.url).toBe("mysql://app:pw@db.internal:3307/inv");
  });

  it("percent-encodes the user and password", async () => {
    const config = await loadConfig({ ...REQUIRED, DB_USER: "a@b", DB_PASSWORD: "p@ss:w/rd#?" });
    expect(config.datasource?.url).toBe("mysql://a%40b:p%40ss%3Aw%2Frd%23%3F@localhost:3306/samdb");
  });

  it("requires strict TLS only when DB_SSL is exactly 'true'", async () => {
    expect((await loadConfig({ ...REQUIRED, DB_SSL: "true" })).datasource?.url).toBe("mysql://sam:@localhost:3306/samdb?sslaccept=strict");
    expect((await loadConfig({ ...REQUIRED, DB_SSL: "false" })).datasource?.url).not.toContain("sslaccept");
    expect((await loadConfig({ ...REQUIRED, DB_SSL: "TRUE" })).datasource?.url).not.toContain("sslaccept");
  });

  it("loads .env exactly when it exists in the working directory", async () => {
    await loadConfig({});
    if (existsSync(".env")) expect(loadEnvFile).toHaveBeenCalledWith(".env");
    else expect(loadEnvFile).not.toHaveBeenCalled();
  });
});

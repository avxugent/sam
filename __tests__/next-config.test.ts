import { describe, it, expect } from "vitest";
import nextConfig from "@/next.config";

describe("next.config redirects()", () => {
  it("sends the legacy settings and import URLs to their /admin pages, temporarily", async () => {
    expect(await nextConfig.redirects!()).toEqual([
      { source: "/settings/users", destination: "/admin/users", permanent: false },
      { source: "/settings/asset-types", destination: "/admin/asset-types", permanent: false },
      { source: "/settings/manufacturers", destination: "/admin/manufacturers", permanent: false },
      { source: "/import", destination: "/admin/import", permanent: false },
    ]);
  });
});

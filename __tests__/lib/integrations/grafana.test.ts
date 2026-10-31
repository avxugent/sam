import { describe, it, expect, vi, afterEach } from "vitest";
import { grafanaExploreUrl } from "@/lib/integrations/grafana";

afterEach(() => vi.unstubAllEnvs());

describe("grafanaExploreUrl()", () => {
  it("links to Explore under GRAFANA_URL, trailing slash or not", () => {
    vi.stubEnv("GRAFANA_URL", "https://grafana.example.org/");
    expect(grafanaExploreUrl()).toBe("https://grafana.example.org/explore");
  });

  it("is null when GRAFANA_URL is unset", () => {
    vi.stubEnv("GRAFANA_URL", "");
    expect(grafanaExploreUrl()).toBeNull();
  });
});

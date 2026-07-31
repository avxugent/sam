import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PANELS, PANEL_TITLES, panelSrc, EMBEDDABLE_DASHBOARDS } from "@/lib/grafana";

const DASHBOARD_DIR = join(
  process.cwd(),
  "ops/ansible/roles/grafana_sam/files/dashboards"
);

function dashboard(uid: string): { panels: Array<{ id: number; title: string }> } {
  return JSON.parse(readFileSync(join(DASHBOARD_DIR, `${uid}.json`), "utf8"));
}

/**
 * Panel ids are assigned by position when the dashboards are built, and SAM
 * embeds them by id. Reordering panels therefore re-points every embed — and an
 * embed showing the wrong panel renders a plausible chart of the wrong thing,
 * which is worse than an error. These tests turn that into a build failure.
 */
describe("embedded panel ids match the built dashboards", () => {
  for (const [uid, titles] of Object.entries(PANEL_TITLES)) {
    describe(uid, () => {
      const byId = new Map(dashboard(uid).panels.map((p) => [p.id, p.title]));

      for (const [id, expectedTitle] of Object.entries(titles)) {
        it(`panel ${id} is still "${expectedTitle}"`, () => {
          expect(byId.get(Number(id))).toBe(expectedTitle);
        });
      }
    });
  }

  it("every id SAM embeds is covered by a title assertion", () => {
    // Otherwise a new embed could be added without protection and drift later.
    const asserted = new Set(
      Object.entries(PANEL_TITLES).flatMap(([uid, t]) =>
        Object.keys(t).map((id) => `${uid}:${id}`)
      )
    );
    const used = [
      ...Object.values(PANELS.room).map((id) => `sam-room:${id}`),
      ...Object.values(PANELS.device).map((id) => `sam-device:${id}`),
    ];
    expect(used.filter((k) => !asserted.has(k))).toEqual([]);
  });
});

describe("panelSrc()", () => {
  it("points at SAM's proxy, never at Grafana directly", () => {
    const src = panelSrc("room", PANELS.room.availability, { fi_number: "14.10.100.013" });
    expect(src.startsWith("/api/grafana-embed/room?")).toBe(true);
    expect(src).not.toContain("http");
  });

  it("passes dashboard variables with the var- prefix", () => {
    const src = panelSrc("device", PANELS.device.state, { hostname: "rec001.example.be" });
    expect(src).toContain("var-hostname=rec001.example.be");
    expect(src).toContain("panelId=1");
  });

  it("escapes values rather than interpolating them raw", () => {
    const src = panelSrc("room", 1, { fi_number: "a&b=c" });
    expect(src).toContain("var-fi_number=a%26b%3Dc");
  });

  it("defaults to a 24h window", () => {
    expect(panelSrc("room", 1, {})).toContain("from=now-24h");
  });

  it("requests a 2x render so the image is not blurry on a high-DPI screen", () => {
    expect(panelSrc("room", 1, {})).toContain("scale=2");
  });
});

describe("EMBEDDABLE_DASHBOARDS", () => {
  it("only names dashboards that are actually built", () => {
    // The proxy resolves a key to a UID rather than trusting the request, so a
    // key naming a dashboard that does not exist would 404 at runtime instead.
    for (const { uid } of Object.values(EMBEDDABLE_DASHBOARDS)) {
      expect(() => dashboard(uid)).not.toThrow();
    }
  });
});

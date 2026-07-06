import { describe, it, expect } from "vitest";
import {
  normalizeModelName,
  similarityDistance,
  findSimilarModel,
  computeModelClusters,
} from "@/lib/model-similarity";

describe("normalizeModelName()", () => {
  it("lowercases and passes through an already-clean name", () => {
    expect(normalizeModelName("PowerEdge R740")).toBe("poweredge r740");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeModelName("PowerEdge   R740")).toBe("poweredge r740");
  });

  it("strips punctuation and treats it as a separator", () => {
    expect(normalizeModelName("PowerEdge-R740!")).toBe("poweredge r740");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeModelName("  PowerEdge R740  ")).toBe("poweredge r740");
  });
});

describe("similarityDistance()", () => {
  it("returns 0 for normalized-identical strings", () => {
    expect(similarityDistance("poweredge r740", "poweredge r740")).toBe(0);
  });

  it("returns the edit distance for a small typo", () => {
    expect(similarityDistance("dell poweredg r740", "dell poweredge r740")).toBe(1);
  });

  it("returns null for different model numbers embedded in a longer name", () => {
    expect(similarityDistance("dell poweredge r750", "dell poweredge r740")).toBeNull();
  });

  it("returns null for different bare model numbers at the ratio threshold", () => {
    expect(similarityDistance("r750", "r740")).toBeNull();
  });

  it("returns null for unrelated strings", () => {
    expect(similarityDistance("epson eb w06", "dell optiplex 7090")).toBeNull();
  });
});

describe("findSimilarModel()", () => {
  it("returns null when the candidate is already an exact match", () => {
    expect(findSimilarModel("PowerEdge R740", ["PowerEdge R740"])).toBeNull();
  });

  it("flags a case/whitespace/punctuation-only variant", () => {
    expect(findSimilarModel("poweredge  r740", ["PowerEdge R740"])).toEqual({
      model: "PowerEdge R740",
      distance: 0,
    });
  });

  it("flags a small typo", () => {
    expect(findSimilarModel("Dell PowerEdg R740", ["Dell PowerEdge R740"])).toEqual({
      model: "Dell PowerEdge R740",
      distance: 1,
    });
  });

  it("does not flag a genuinely different model number", () => {
    expect(findSimilarModel("Dell PowerEdge R750", ["Dell PowerEdge R740"])).toBeNull();
    expect(findSimilarModel("R750", ["R740"])).toBeNull();
  });

  it("does not flag unrelated strings", () => {
    expect(findSimilarModel("Epson EB-W06", ["Dell OptiPlex 7090"])).toBeNull();
  });

  it("returns null for an empty or whitespace-only candidate", () => {
    expect(findSimilarModel("   ", ["PowerEdge R740"])).toBeNull();
  });

  it("picks the closest match among several candidates", () => {
    const match = findSimilarModel("PowerEdge Rack Servr", [
      "PowerEdge Rack Server",
      "PowerEdge Tower Server",
    ]);
    expect(match).toEqual({ model: "PowerEdge Rack Server", distance: 1 });
  });
});

describe("computeModelClusters()", () => {
  it("groups normalized-equal spellings into a cluster, sorted by count desc", () => {
    const clusters = computeModelClusters([
      { model: "PowerEdge R740", count: 5 },
      { model: "poweredge r740", count: 2 },
      { model: "HPE ProLiant DL380", count: 3 },
    ]);
    expect(clusters).toEqual([
      [
        { model: "PowerEdge R740", count: 5 },
        { model: "poweredge r740", count: 2 },
      ],
    ]);
  });

  it("excludes singleton models with no similar match", () => {
    const clusters = computeModelClusters([
      { model: "PowerEdge R740", count: 5 },
      { model: "HPE ProLiant DL380", count: 3 },
    ]);
    expect(clusters).toEqual([]);
  });
});

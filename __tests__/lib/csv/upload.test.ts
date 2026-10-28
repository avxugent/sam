import { describe, it, expect } from "vitest";
import { readCsvUpload } from "@/lib/csv/upload";

// jsdom's File breaks real multipart parsing, so stub formData() directly.
function req(file: { name: string; type: string; text: () => Promise<string> } | null) {
  return { formData: async () => ({ get: () => file }) } as unknown as Request;
}

describe("readCsvUpload()", () => {
  it("returns the text of a CSV upload", async () => {
    expect(await readCsvUpload(req({ name: "a.csv", type: "text/csv", text: async () => "A;B" }))).toEqual({ text: "A;B" });
  });

  it("accepts a .csv file with a generic MIME type", async () => {
    expect(await readCsvUpload(req({ name: "A.CSV", type: "application/octet-stream", text: async () => "x" }))).toEqual({ text: "x" });
  });

  it("400 without a file", async () => {
    const result = await readCsvUpload(req(null));
    expect("error" in result && result.error.status).toBe(400);
  });

  it("400 for a non-CSV file", async () => {
    const result = await readCsvUpload(req({ name: "a.xlsx", type: "application/vnd.ms-excel", text: async () => "" }));
    expect("error" in result && (await result.error.json()).error).toMatch(/Only CSV/);
  });
});

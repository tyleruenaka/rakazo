import { describe, expect, it } from "vitest";
import { artifactKind, filterArtifactsByKind } from "./artifact-kind";

describe("artifact kinds", () => {
  it.each([
    ["image/png", "image"],
    ["image/webp", "image"],
    ["application/pdf", "document"],
    ["text/markdown", "document"],
    ["text/plain", "document"],
    ["text/csv", "document"],
    ["text/html", "code"],
    ["application/json", "code"],
    ["audio/mpeg", "media"],
    ["video/mp4", "media"],
    ["application/zip", "other"],
    ["application/x-unknown", "other"],
  ])("puts %s under %s", (mimeType, kind) => {
    expect(artifactKind(mimeType)).toBe(kind);
  });

  it("filters a list by kind and keeps everything for all", () => {
    const items = [
      { id: "shot", mimeType: "image/png" },
      { id: "notes", mimeType: "text/markdown" },
      { id: "page", mimeType: "text/html" },
    ];
    expect(filterArtifactsByKind(items, "all").map((item) => item.id)).toEqual([
      "shot",
      "notes",
      "page",
    ]);
    expect(filterArtifactsByKind(items, "image").map((item) => item.id)).toEqual(["shot"]);
    expect(filterArtifactsByKind(items, "code").map((item) => item.id)).toEqual(["page"]);
    expect(filterArtifactsByKind(items, "media")).toEqual([]);
  });
});

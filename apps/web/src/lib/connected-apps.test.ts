import type { ConnectionCatalogItem } from "@rakazo/contracts";
import { expect, it } from "vitest";
import { connectedAppMarks } from "./connected-apps";

const catalog: ConnectionCatalogItem[] = [
  {
    connectorId: "demo",
    slug: "alpha",
    name: "Alpha",
    logo: null,
    connected: false,
    noAuth: false,
  },
  { connectorId: "demo", slug: "beta", name: "Beta", logo: null, connected: false, noAuth: false },
  {
    connectorId: "demo",
    slug: "gamma",
    name: "Gamma",
    logo: null,
    connected: false,
    noAuth: false,
  },
  {
    connectorId: "demo",
    slug: "delta",
    name: "Delta",
    logo: "https://example.test/delta.svg",
    connected: false,
    noAuth: false,
  },
];

it("uses artwork-first catalog suggestions without changing the fetched order", () => {
  expect(connectedAppMarks(catalog, [])).toEqual({
    marks: [
      { name: "Delta", logo: "https://example.test/delta.svg" },
      { name: "Alpha", logo: null },
      { name: "Beta", logo: null },
    ],
    connected: 0,
  });
  expect(catalog[0]!.name).toBe("Alpha");
});

it("shows connected apps instead of suggestions and returns suggestions after disconnect", () => {
  expect(
    connectedAppMarks(
      catalog.map((item, index) => ({ ...item, connected: index === 1 })),
      [],
    ),
  ).toEqual({ marks: [{ name: "Beta", logo: null }], connected: 1 });
  expect(connectedAppMarks(catalog, []).marks).toHaveLength(3);
  expect(connectedAppMarks([], [])).toEqual({ marks: [], connected: 0 });
});

it("deduplicates suggestions and preserves catalog order when artwork is missing", () => {
  const letters = catalog.slice(0, 3);
  expect(connectedAppMarks([letters[0]!, ...letters], []).marks).toEqual(
    letters.map(({ name, logo }) => ({ name, logo })),
  );
});

for (const connected of [false, true]) {
  it(`prefers distinct fallback initials for ${connected ? "connected apps" : "suggestions"}`, () => {
    const items = ["Gamma", "Garden", "Guide", "Alpha", "Beta"].map((name) => ({
      ...catalog[0]!,
      name,
      slug: name.toLowerCase(),
      connected,
    }));
    expect(connectedAppMarks(items, []).marks.map((app) => app.name)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
    expect(connectedAppMarks(items.slice(0, 3), []).marks.map((app) => app.name)).toEqual([
      "Gamma",
      "Garden",
      "Guide",
    ]);
  });
}

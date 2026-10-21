// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listSpace: vi.fn(), listVersions: vi.fn(), getById: vi.fn() }));
vi.mock("../../lib/rpc", () => ({ rpc: { artifacts: api } }));
vi.mock("../../lib/relative-time", () => ({ formatRelativeTime: () => "1d ago" }));
vi.mock("../../components/ArtifactPreviewPane", () => ({
  ArtifactPreviewPane: ({ artifactId }: { artifactId: string }) => (
    <div data-testid="artifact-preview">{artifactId}</div>
  ),
}));
vi.mock("@lingui/react/macro", () => {
  const t = (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

import { BotLibrary } from "./bot-library";

function artifact(id: string, name: string, mimeType: string, botId = "bot-a", versionCount = 1) {
  return {
    id,
    botId,
    groupId: null,
    runId: null,
    name,
    description: null,
    mimeType,
    size: 64,
    version: versionCount,
    versionCount,
    createdAt: "2026-10-20T10:00:00.000Z",
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = vi.fn(() => "blob:thumbnail");
      static override revokeObjectURL = vi.fn();
    },
  );
  api.listSpace.mockReset();
  api.listVersions.mockReset();
  api.getById.mockReset().mockResolvedValue({ contentBase64: "AA==", mimeType: "image/png" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("lists only the open bot's artifacts and reloads when the bot changes", async () => {
  api.listSpace.mockImplementation(async ({ botId }: { botId: string }) => ({
    items:
      botId === "bot-a"
        ? [artifact("a-1", "Launch notes.md", "text/markdown")]
        : [artifact("b-1", "Pricing page.html", "text/html", "bot-b")],
    nextCursor: null,
  }));
  await act(async () => root.render(<BotLibrary botId="bot-a" />));
  expect(api.listSpace).toHaveBeenLastCalledWith({ botId: "bot-a", limit: 60 });
  expect(container.textContent).toContain("Launch notes.md");

  await act(async () => root.render(<BotLibrary botId="bot-b" />));
  expect(api.listSpace).toHaveBeenLastCalledWith({ botId: "bot-b", limit: 60 });
  expect(container.textContent).toContain("Pricing page.html");
  expect(container.textContent).not.toContain("Launch notes.md");
});

it("shows the empty state when the bot has made nothing", async () => {
  api.listSpace.mockResolvedValue({ items: [], nextCursor: null });
  await act(async () => root.render(<BotLibrary botId="bot-a" />));
  expect(container.textContent).toBe("Files this Bot makes show up here");
});

it("thumbnails the newest version of an image and opens the shared preview", async () => {
  api.listSpace.mockResolvedValue({
    items: [artifact("shot-root", "Homepage.png", "image/png", "bot-a", 2)],
    nextCursor: null,
  });
  api.listVersions.mockResolvedValue([
    { id: "shot-v2", version: 2, name: "Homepage.png", createdAt: "2026-10-20T10:00:00.000Z" },
    { id: "shot-root", version: 1, name: "Homepage.png", createdAt: "2026-10-19T10:00:00.000Z" },
  ]);
  await act(async () => root.render(<BotLibrary botId="bot-a" />));
  await act(async () => {
    await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull());
  });
  expect(api.listVersions).toHaveBeenCalledWith({ familyId: "shot-root" });
  expect(api.getById).toHaveBeenCalledWith({ artifactId: "shot-v2" });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:thumbnail");

  const row = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Homepage.png"),
  );
  await act(async () => row?.click());
  expect(document.querySelector("[data-testid='artifact-preview']")?.textContent).toBe("shot-root");
});

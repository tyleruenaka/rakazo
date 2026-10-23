// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PinnedTile, PinnedTileGrid } from "./pinned-tile";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  // jsdom has no ResizeObserver; the grid only uses it to animate its height.
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function tile(name: string, props: Partial<ComponentProps<typeof PinnedTile>> = {}) {
  return (
    <PinnedTile
      key={name}
      name={name}
      avatar={<span data-testid="avatar" />}
      cardAvatar={<span />}
      cardLine={`Last message from ${name}`}
      unread={false}
      active={false}
      botName
      {...props}
    />
  );
}

it("lays tiles out in one centered wrapping group, in pin order", async () => {
  await act(async () =>
    root.render(
      <PinnedTileGrid label="Pinned">
        {[tile("Chief"), tile("Ezra"), tile("Benny")]}
      </PinnedTileGrid>,
    ),
  );
  const grid = host.querySelector('[role="group"]')!;
  expect(grid.getAttribute("aria-label")).toBe("Pinned");
  expect(grid.className).toContain("flex-wrap");
  expect(grid.className).toContain("justify-center");
  const tiles = [...grid.querySelectorAll("button")];
  expect(tiles.map((button) => button.textContent)).toEqual(["Chief", "Ezra", "Benny"]);
  for (const button of tiles) {
    expect(button.className).toContain("w-[95px]");
    expect(button.className).toContain("h-[115px]");
  }
});

it("keeps the roster name, chip, unread text and button props on the tile", async () => {
  const onClick = vi.fn();
  const onKeyDown = vi.fn();
  await act(async () =>
    root.render(
      tile("Admin Assistant", {
        label: "News Anchor",
        unread: true,
        active: true,
        onClick,
        onKeyDown,
        "aria-current": "page",
        ...{ "data-roster-bot-id": "bot-1", "data-roster-unread": "true" },
      }),
    ),
  );
  const button = host.querySelector("button")!;
  expect(button.getAttribute("aria-current")).toBe("page");
  expect(button.dataset.rosterBotId).toBe("bot-1");
  expect(button.dataset.rosterUnread).toBe("true");
  expect(button.textContent).toBe("Admin Assistant (unread)News Anchor");
  expect(button.querySelector("[data-roster-bot-name]")?.textContent).toBe("Admin Assistant");
  expect(button.className).toContain("bg-sidebar-accent");
  await act(async () => button.click());
  expect(onClick).toHaveBeenCalledTimes(1);
  await act(async () =>
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }),
    ),
  );
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

it("shows no chip for a chat without a title", async () => {
  await act(async () => root.render(tile("Chief", { label: "" })));
  expect(host.querySelector("button")?.textContent).toBe("Chief");
});

it("opens the display-only hover card with the full name and last message on focus", async () => {
  await act(async () => root.render(tile("Admin Assistant")));
  const button = host.querySelector("button")!;
  await act(async () => {
    button.focus();
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
  const card = document.querySelector('[data-testid="pinned-tile-card"]');
  expect(card?.textContent).toBe("Admin AssistantLast message from Admin Assistant");
  expect(card?.className).toContain("pointer-events-none");
  expect(card?.querySelector("button, a")).toBeNull();
});

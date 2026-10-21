// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotRail, RailItem, railGroups } from "./bot-rail";
import { sidebarGroupsForSpaces } from "./space-sidebar";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const chat = (
  id: string,
  fields: { pinned?: boolean; sectionId?: string | null; parentBotId?: string | null } = {},
) => ({ id, name: id, pinned: false, sectionId: null, ...fields });

describe("railGroups", () => {
  it("lists pinned chats first, then each section in sidebar order, with no empty groups", () => {
    const groups = sidebarGroupsForSpaces(
      [
        {
          id: "space-1",
          name: "Personal",
          bots: [
            chat("Sunny", { sectionId: "eng" }),
            chat("Justin", { pinned: true, sectionId: "admin" }),
            chat("Lenny", { sectionId: "mkt" }),
            chat("Admin", { pinned: true }),
            chat("Loose"),
          ],
          groups: [chat("Launch room", { sectionId: "mkt" })],
          botSections: [
            { id: "eng", name: "Engineering" },
            { id: "empty", name: "Empty" },
            { id: "mkt", name: "Marketing" },
          ],
        },
      ],
      "",
    );
    expect(
      railGroups(groups).map((group) => [group.pinned, group.items.map((item) => item.chat.id)]),
    ).toEqual([
      [true, ["Justin", "Admin"]],
      [false, ["Sunny"]],
      [false, ["Lenny", "Launch room"]],
      [false, ["Loose"]],
    ]);
  });

  it("puts sub-bots right after their parent", () => {
    const groups = railGroups([
      {
        key: "section:eng",
        pinned: false,
        bots: [
          chat("Child", { parentBotId: "Parent" }),
          chat("Other"),
          chat("Parent"),
          chat("Grandchild", { parentBotId: "Child" }),
        ],
      },
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "Other",
      "Parent",
      "Child",
      "Grandchild",
    ]);
  });
});

function railItem(props: Partial<ComponentProps<typeof RailItem>> = {}) {
  return (
    <RailItem
      name="Justin"
      avatar={<span data-testid="avatar" />}
      cardAvatar={<span />}
      cardLine="Last message from Justin"
      unread={false}
      selected={false}
      {...props}
    />
  );
}

describe("RailItem", () => {
  it("names the chat, marks it unread and draws the dot on the avatar", async () => {
    await act(async () => root.render(railItem({ unread: true })));
    const button = host.querySelector("button")!;
    expect(button.textContent).toBe("Justin (unread)");
    expect(button.getAttribute("aria-current")).toBeNull();
    const dot = button.querySelector(".bg-unread")!;
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.className).toContain("ring-sidebar");
  });

  it("highlights the open chat and keeps the dot's ring in the highlight color", async () => {
    await act(async () => root.render(railItem({ unread: true, selected: true })));
    const button = host.querySelector("button")!;
    expect(button.getAttribute("aria-current")).toBe("page");
    expect(button.className).toContain("bg-sidebar-accent");
    expect(button.querySelector(".bg-unread")!.className).toContain("ring-sidebar-accent");
  });

  it("has no dot when read", async () => {
    await act(async () => root.render(railItem()));
    expect(host.querySelector(".bg-unread")).toBeNull();
    expect(host.querySelector("button")!.textContent).toBe("Justin");
  });

  it("opens the chat on click and the chat menu on right-click", async () => {
    const onClick = vi.fn();
    const onContextMenu = vi.fn();
    await act(async () => root.render(railItem({ onClick, onContextMenu })));
    const button = host.querySelector("button")!;
    await act(async () => button.click());
    await act(async () => {
      button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledOnce();
    expect(onContextMenu).toHaveBeenCalledOnce();
  });
});

function rail(props: Partial<ComponentProps<typeof BotRail<string>>> = {}) {
  return (
    <BotRail<string>
      groups={[
        { key: "pinned", pinned: true, items: ["Admin", "Justin"] },
        { key: "section:eng", pinned: false, items: ["Sunny"] },
        { key: "section:mkt", pinned: false, items: ["Lenny"] },
      ]}
      renderItem={(item) => (
        <button key={item} type="button" data-chat={item}>
          {item}
        </button>
      )}
      chrome={null}
      onExpand={vi.fn()}
      onSearch={vi.fn()}
      activityMode={false}
      onActivity={vi.fn()}
      createOpen={false}
      onCreateOpenChange={vi.fn()}
      createMenu={<div data-testid="create-menu">menu</div>}
      onConnectApps={vi.fn()}
      update={null}
      account={<button type="button" data-testid="account" />}
      {...props}
    />
  );
}

const button = (name: string) =>
  host.querySelector<HTMLButtonElement>(`nav button[aria-label="${name}"]`)!;

it("opens Grok's hover card with the name and last message on focus", async () => {
  await act(async () => root.render(railItem({ unread: true })));
  await act(async () => {
    host.querySelector("button")!.focus();
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
  const card = document.querySelector('[data-testid="rail-chat-card"]');
  expect(card?.textContent).toBe("JustinLast message from Justin");
  expect(card?.className).toContain("w-[260px]");
  expect(card?.querySelector(".bg-unread")).not.toBeNull();
});

describe("BotRail", () => {
  it("renders each group in order with a short divider between groups", async () => {
    await act(async () => root.render(rail()));
    const nav = host.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Bots");
    // It covers the sidebar only while that is the 88px rail (130px or narrower).
    expect(nav.className).toContain("@max-[130px]/sidebar:flex");
    expect([...nav.querySelectorAll("[data-chat]")].map((item) => item.textContent)).toEqual([
      "Admin",
      "Justin",
      "Sunny",
      "Lenny",
    ]);
    const dividers = [...nav.querySelectorAll("[data-rail-divider]")];
    expect(dividers).toHaveLength(2);
    // Grok spaces the line after the pinned group (10/16) wider than between sections (12/6).
    expect(dividers[0]?.className).toContain("mt-2.5 mb-4");
    expect(dividers[1]?.className).toContain("mt-3 mb-1.5");
    expect(dividers[0]?.previousElementSibling?.getAttribute("data-rail-group")).toBe("pinned");
  });

  it("wires the bottom actions in Grok's order, with Search and Activity before Create", async () => {
    const onExpand = vi.fn();
    const onSearch = vi.fn();
    const onActivity = vi.fn();
    const onConnectApps = vi.fn();
    const onCreateOpenChange = vi.fn();
    await act(async () =>
      root.render(rail({ onExpand, onSearch, onActivity, onConnectApps, onCreateOpenChange })),
    );
    const bottom = host.querySelector("nav")!.lastElementChild!;
    expect(
      [...bottom.querySelectorAll("button")].map(
        (item) => item.getAttribute("aria-label") ?? item.dataset.testid,
      ),
    ).toEqual(["Show bots", "Search", "Activity", "Create", "Connect apps", "account"]);
    expect(button("Show bots").dataset.testid).toBe("restore-bots-sidebar");
    await act(async () => button("Show bots").click());
    await act(async () => button("Search").click());
    await act(async () => button("Activity").click());
    await act(async () => button("Connect apps").click());
    await act(async () => button("Create").click());
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledOnce();
    expect(onConnectApps).toHaveBeenCalledOnce();
    expect(onCreateOpenChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("shows the create menu only while it is open", async () => {
    await act(async () => root.render(rail()));
    expect(document.querySelector('[data-testid="create-menu"]')).toBeNull();
    await act(async () => root.render(rail({ createOpen: true })));
    expect(document.querySelector('[data-testid="create-menu"]')).not.toBeNull();
  });

  it("marks Activity pressed while activity mode is on", async () => {
    await act(async () => root.render(rail({ activityMode: true })));
    expect(button("Activity").getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.render(rail({ activityMode: false })));
    expect(button("Activity").getAttribute("aria-pressed")).toBe("false");
  });
});

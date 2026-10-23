// @vitest-environment jsdom
import type { BotSection } from "@rakazo/contracts";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BotContextMenu } from "./BotContextMenu";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Reduced motion keeps the nest targets' bot avatars still, which jsdom cannot animate.
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const sections: BotSection[] = [
  { id: "section-1", name: "Work", position: 0, createdAt: "", updatedAt: "" },
  { id: "section-2", name: "Home", position: 1, createdAt: "", updatedAt: "" },
];

async function render(props: Partial<ComponentProps<typeof BotContextMenu>> = {}) {
  await act(async () =>
    root.render(
      <BotContextMenu
        bot={{ name: "Helper", pinned: false, sectionId: "section-1", unread: false }}
        position={{ x: 10, y: 10 }}
        onClose={() => {}}
        onTogglePinned={() => {}}
        sections={sections}
        onMoveToSection={() => {}}
        onCreateSection={() => {}}
        onRenameSection={() => {}}
        onToggleUnread={() => {}}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onClear={() => {}}
        onArchive={() => {}}
        onDelete={() => {}}
        {...props}
      />,
    ),
  );
}
const menu = () => document.querySelector('[data-slot="dropdown-menu-content"]')!;
const items = () => [...menu().querySelectorAll("[role=menuitem]")].map((row) => row.textContent);

it("hides Move to and Pin for a bot nested under an unpinned parent", async () => {
  await render({
    bot: { name: "Helper", pinned: false, sectionId: null, unread: false, parentBotId: "bot-lead" },
    canMove: false,
    parentName: "Lead",
    onUnnest: () => {},
  });
  expect(menu().getAttribute("aria-label")).toBe("Actions for Helper");
  expect(items()).not.toContain("Move to");
  expect(items()).not.toContain("Pin");
  expect(items()).toContain("Move out of Lead");
  expect(document.body.textContent).not.toContain("New section");
  expect(document.body.textContent).not.toContain("Rename section");
});

it("keeps Move to but not Pin for a bot nested under a pinned parent", async () => {
  await render({
    bot: { name: "Helper", pinned: false, sectionId: null, unread: false, parentBotId: "bot-lead" },
    parentName: "Lead",
    onUnnest: () => {},
  });
  expect(items()).toContain("Move to");
  expect(items()).not.toContain("Pin");
  expect(items()).toContain("Move out of Lead");
});

it("offers Pin, Move to and Nest under for a top-level bot", async () => {
  await render({
    bot: {
      name: "Helper",
      pinned: false,
      sectionId: "section-1",
      unread: false,
      parentBotId: null,
    },
    nestTargets: [
      { id: "bot-lead", name: "Lead", color: "#8B5CF6" },
      { id: "bot-other", name: "Other", color: "#10B981" },
    ],
    onNest: () => {},
  });
  expect(items().slice(0, 3)).toEqual(["Pin", "Move to", "Nest under"]);
  expect(items().some((item) => item?.startsWith("Move out of"))).toBe(false);

  const nestUnder = [...menu().querySelectorAll<HTMLElement>("[role=menuitem]")].find(
    (row) => row.textContent === "Nest under",
  )!;
  await act(async () => nestUnder.click());
  const submenu = [...document.querySelectorAll('[role="menu"]')].find((el) => el !== menu())!;
  expect([...submenu.querySelectorAll("[role=menuitem]")].map((row) => row.textContent)).toEqual([
    "Lead",
    "Other",
  ]);
});

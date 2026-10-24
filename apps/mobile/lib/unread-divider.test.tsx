// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { settleReadBoundary } from "@rakazo/core";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style ?? {}) as Record<string, unknown>);
  return {
    StyleSheet: { create: <T,>(styles: T) => styles },
    View: (props: {
      children?: ReactNode;
      style?: unknown;
      accessible?: boolean;
      accessibilityLabel?: string;
    }) =>
      createElement(
        "div",
        {
          "aria-label": props.accessibilityLabel,
          "data-accessible": String(props.accessible),
          "data-style": JSON.stringify(flatten(props.style)),
        },
        props.children,
      ),
    Text: (props: { children?: ReactNode; style?: unknown }) =>
      createElement("span", { "data-style": JSON.stringify(flatten(props.style)) }, props.children),
  };
});
const appearance = vi.hoisted(() => ({ current: "dark" as "dark" | "light" }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({ primary: "ink", unread: "unread-blue" }),
  useResolvedAppearance: () => appearance.current,
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ t: (text: string) => text }) }));

import { UnreadDivider } from "../components/unread-divider";
import { chatAccentColor } from "./user-bubble-color";

describe("UnreadDivider", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    appearance.current = "dark";
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("avoids extra top spacing after a time separator", () => {
    act(() => root.render(<UnreadDivider afterSeparator />));
    const row = container.firstElementChild as HTMLElement;
    expect(JSON.parse(row.dataset.style!).paddingTop).toBe(0);
  });

  it("reads as one element, New messages, with New between two unread-blue hairlines", () => {
    act(() => root.render(<UnreadDivider />));
    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute("aria-label")).toBe("New messages");
    expect(row.dataset.accessible).toBe("true");
    const [before, label, after] = [...row.children] as HTMLElement[];
    expect(label?.textContent).toBe("New");
    expect(JSON.parse(label!.dataset.style!)).toMatchObject({
      color: "unread-blue",
      // The time separator's size, so the two read as one family.
      fontWeight: "500",
      fontSize: 14,
      lineHeight: 18,
    });
    for (const line of [before, after]) {
      expect(JSON.parse(line!.dataset.style!)).toMatchObject({
        backgroundColor: "unread-blue",
        height: 1,
        flex: 1,
        opacity: 0.4,
      });
    }
  });

  const colors = () => {
    const [before, label, after] = [...(container.firstElementChild as HTMLElement).children].map(
      (element) => JSON.parse((element as HTMLElement).dataset.style!),
    );
    return { lines: [before.backgroundColor, after.backgroundColor], label: label.color };
  };

  it("takes the bot's bubble color in a one-on-one chat with a colored bot", () => {
    const accent = chatAccentColor({ id: "b_1", color: "#8B5CF6" });
    appearance.current = "light";
    act(() => root.render(<UnreadDivider accent={accent} />));
    // The same shade as your bubbles (userBubbleColor), lines and label alike.
    expect(colors()).toEqual({ lines: ["#734ccc", "#734ccc"], label: "#734ccc" });
    appearance.current = "dark";
    act(() => root.render(<UnreadDivider accent={accent} afterSeparator />));
    // On dark the shade is too dim for text, so New takes the bot's full color.
    expect(colors()).toEqual({ lines: ["#734ccc", "#734ccc"], label: "#8B5CF6" });
  });

  it("stays unread blue without an accent, as where your bubbles stay neutral", () => {
    for (const scheme of ["dark", "light"] as const) {
      appearance.current = scheme;
      act(() => root.render(<UnreadDivider />));
      expect(colors()).toEqual({ lines: ["unread-blue", "unread-blue"], label: "unread-blue" });
    }
  });
});

// Exercise the screen's visit transitions without loading native UI dependencies.
const testFileUrl = import.meta.url;
const source = readFileSync(new URL("../app/thread.tsx", testFileUrl), "utf8");
const visitTransition = source.slice(
  source.indexOf("  const threadKey = groupId ?? botId;"),
  source.indexOf("  const [threadScrollState, setThreadScrollState]"),
);

it("starts a fresh read visit when a retained thread regains focus", () => {
  const readVisit = {
    current: { target: undefined as string | undefined, visit: 0, focused: true },
  };
  const readVisibleTarget = { current: null as string | null };
  const render = (focused: boolean) => {
    new Function("botId", "groupId", "focused", "readVisit", "readVisibleTarget", visitTransition)(
      "bot-1",
      undefined,
      focused,
      readVisit,
      readVisibleTarget,
    );
  };
  render(true);
  const initialVisit = readVisit.current.visit;
  let boundary = settleReadBoundary(null, initialVisit, { visit: initialVisit, seq: 3 });
  readVisibleTarget.current = "bot-1";
  render(true);
  expect(readVisit.current.visit).toBe(initialVisit);
  render(false);
  expect(readVisit.current.visit).toBe(initialVisit);
  render(true);
  expect(readVisit.current.visit).toBe(initialVisit + 1);
  expect(readVisibleTarget.current).toBeNull();
  const returnedVisit = readVisit.current.visit;
  boundary = settleReadBoundary(boundary, returnedVisit, { visit: returnedVisit, seq: null });
  expect(boundary).toEqual({ visit: returnedVisit, seq: null });

  // Replies received during another child-thread visit get the current server cursor.
  render(false);
  render(true);
  const nextVisit = readVisit.current.visit;
  boundary = settleReadBoundary(boundary, nextVisit, { visit: nextVisit, seq: 8 });
  expect(boundary).toEqual({ visit: nextVisit, seq: 8 });
  render(true);
  expect(readVisit.current.visit).toBe(nextVisit);
});

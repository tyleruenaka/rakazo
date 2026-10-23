// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import type { ThreadMessage } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", async () => {
  const { i18n } = await import("@lingui/core");
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return {
    useLingui: () => ({ t, i18n }),
    Trans: ({ children }: { children: ReactNode }) => children,
  };
});

const threadMessages = vi.fn();
vi.mock("../lib/rpc", () => ({
  rpc: { threads: { messages: (...args: unknown[]) => threadMessages(...args) } },
}));

import { PeerMessagesOverlay } from "./PeerMessagesOverlay";

function message(id: string, createdAt: string, blocks: ThreadMessage["blocks"]): ThreadMessage {
  return { id, threadId: "t_1", seq: 1, role: "bot", blocks, createdAt };
}

const exchange = [
  message("m_1", "2026-10-20T09:00:00.000Z", [
    { kind: "bot_message_sent", toBotId: "b_ezra", toBotName: "Ezra", text: "Plan the move" },
  ]),
  message("m_2", "2026-10-20T09:01:00.000Z", [
    { kind: "bot_message_received", fromBotId: "b_ezra", fromBotName: "Ezra", text: "On it" },
  ]),
  message("m_3", "2026-10-21T08:00:00.000Z", [
    { kind: "bot_message_received", fromBotId: "b_ezra", fromBotName: "Ezra", text: "Done" },
  ]),
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Reduced motion keeps the bot avatars still, which jsdom cannot animate.
  window.matchMedia ??= () =>
    ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  threadMessages.mockResolvedValue({ messages: exchange, olderCursor: null });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  threadMessages.mockReset();
});

async function renderView(onClose = vi.fn(), peerBotColor = "#EC4899") {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <PeerMessagesOverlay
        botId="b_chief"
        botName="Chief"
        botColor="#8B5CF6"
        peerBotId="b_ezra"
        peerBotName="Ezra"
        peerBotColor={peerBotColor}
        onClose={onClose}
      />,
    );
  });
  const view = container.querySelector<HTMLElement>('[data-testid="peer-conversation-view"]');
  if (!view) throw new Error("peer view not rendered");
  return { view, onClose, opener };
}

describe("PeerMessagesOverlay", () => {
  it("names the pair in a heading and loads the exchange with peer runs", async () => {
    const { view } = await renderView();
    const heading = view.querySelector("h2");
    expect(heading?.getAttribute("aria-label")).toBe("Chief · Ezra");
    expect(heading?.textContent).toBe("ChiefEzra");
    expect(view.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(threadMessages).toHaveBeenCalledWith(
      { botId: "b_chief", before: undefined, includePeerRuns: true },
      expect.anything(),
    );
  });

  it("puts every message on the left with its sender's name and a separator per day", async () => {
    const { view } = await renderView();
    const rows = [...view.querySelectorAll('[data-testid="peer-message"]')];
    expect(rows.map((row) => row.querySelector(".rk-peer-name")?.textContent)).toEqual([
      "Chief",
      "Ezra",
      "Ezra",
    ]);
    expect(rows.map((row) => row.textContent)).toEqual([
      "ChiefPlan the move",
      "EzraOn it",
      "EzraDone",
    ]);
    expect(view.querySelector(".justify-end")).toBeNull();
    // The first message of each time block gets the chat's time separator.
    expect(view.querySelectorAll('[data-testid="time-separator"]')).toHaveLength(2);
    const name = rows[1]?.querySelector<HTMLElement>(".rk-peer-name");
    expect(name?.style.getPropertyValue("--bot-accent")).toBe("#EC4899");
  });

  it("leaves a white or gray sender's name untinted", async () => {
    for (const color of ["#FFFFFF", "#64748B"]) {
      const { view } = await renderView(vi.fn(), color);
      const names = [...view.querySelectorAll<HTMLElement>(".rk-peer-name")];
      expect(names[0]?.style.getPropertyValue("--bot-accent")).toBe("#8B5CF6");
      expect(names[1]?.style.getPropertyValue("--bot-accent")).toBe("");
      expect(names[1]?.style.getPropertyValue("--bot-name")).toBe("");
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it("is view-only: no field, and Close Chat in a labelled group", async () => {
    const { view, onClose } = await renderView();
    expect(view.querySelector("textarea, input")).toBeNull();
    const footer = view.querySelector("fieldset");
    expect(footer?.getAttribute("aria-label")).toBe("This chat is view-only");
    const close = footer?.querySelector("button");
    expect(close?.textContent).toBe("Close Chat");
    act(() => close?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const { view, onClose, opener } = await renderView();
    expect(document.activeElement).toBe(view.querySelector("fieldset button"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();
    act(() => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("shows the empty state when the peer has no messages", async () => {
    threadMessages.mockResolvedValue({ messages: [], olderCursor: null });
    const { view } = await renderView();
    expect(view.textContent).toContain("No messages with Ezra yet.");
    expect(view.querySelector('[data-testid="peer-conversation-transcript"]')).toBeNull();
  });
});

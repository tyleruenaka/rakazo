// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const { createElement } = await import("react");

  const element =
    (tag: string) =>
    ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement(
        tag,
        { "data-style": JSON.stringify(Object.assign({}, ...[style].flat())) },
        children,
      );

  return {
    Modal: element("dialog"),
    Pressable: element("button"),
    ScrollView: element("div"),
    StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {} },
    Text: element("span"),
    View: element("div"),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("./i18n", () => ({ useI18n: () => ({ t: (text: string) => text }) }));

vi.mock("./native", () => ({
  native: { fill: "fill", fillPressed: "fill-pressed" },
  useMobileTokens: () => ({ foreground: "foreground", mutedForeground: "muted" }),
}));

vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));

import { VoiceChatCard } from "../components/VoiceChatCard";

function styleOf(element: Element | null) {
  return JSON.parse(element?.getAttribute("data-style") ?? "{}") as Record<string, unknown>;
}

describe("VoiceChatCard", () => {
  it("is one centered tappable line with a zero-padded duration, at least 44pt tall", () => {
    const html = renderToStaticMarkup(
      <VoiceChatCard group={{ kind: "voiceChat", key: "call:1", callId: "1", messages: [] }} />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const row = styleOf(document.querySelector("button"));

    expect(row.alignSelf).toBe("center");
    expect(row.minHeight).toBe(44);
    expect(document.querySelector("button > span")?.textContent).toBe("Voice chat · 00:00");
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { endCall, startCall, toggleMute, useCallBotId, useCallSession } from "./call-session";

vi.mock("@rakazo/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@rakazo/core")>()),
  runThreadSubscription: vi.fn(async () => undefined),
}));
vi.mock("./call-pickup.js", () => ({ pickUp: vi.fn(async () => undefined) }));
vi.mock("./dictation.js", () => ({
  dictation: {
    listen: vi.fn(async () => undefined),
    stop: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock("./tts.js", () => ({
  speaker: {
    speak: vi.fn(),
    stop: vi.fn(),
    isSpeaking: vi.fn(() => false),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock("./rpc.js", () => ({ rpc: { threads: { endCall: vi.fn(async () => ({ ok: true })) } } }));

afterEach(() => endCall());

it("re-renders a screen that follows the call only when the call starts or ends", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const renders = { screen: 0, bar: 0 };
  function Screen() {
    renders.screen += 1;
    return <span>{useCallBotId()}</span>;
  }
  function Bar() {
    renders.bar += 1;
    useCallSession();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <>
        <Screen />
        <Bar />
      </>,
    ),
  );
  act(() => startCall({ botId: "bot-1", botName: "Ada" }));
  const afterStart = { ...renders };
  act(() => toggleMute());
  act(() => toggleMute());
  // The bar follows every change; the screen does not.
  expect(renders.bar).toBeGreaterThan(afterStart.bar);
  expect(renders.screen).toBe(afterStart.screen);
  act(() => endCall());
  expect(renders.screen).toBe(afterStart.screen + 1);
  act(() => root.unmount());
});

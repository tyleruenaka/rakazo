// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CallState } from "../../lib/call-session";
import { endCall, toggleMute } from "../../lib/call-session";
import { rpc } from "../../lib/rpc";
import { CallBar } from "./CallCard";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) => String.raw(parts, ...values),
  }),
}));
vi.mock("@rakazo/ui-web", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@rakazo/ui-web")>()),
  BotAvatar: () => <span data-testid="avatar" />,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
  TooltipContent: () => null,
}));
const session = vi.hoisted(() => ({
  call: null as CallState | null,
  ending: null as CallState | null,
}));
vi.mock("../../lib/call-session", () => ({
  endCall: vi.fn(),
  toggleMute: vi.fn(),
  useCallSession: () => session.call,
  useEndingCall: () => session.ending,
}));
vi.mock("../../lib/rpc", () => ({
  rpc: {
    voice: {
      status: vi.fn(async () => ({ provider: "scripted", voiceId: "liora" })),
      voices: vi.fn(async () => [
        { id: "liora", label: "Liora" },
        { id: "ash", label: "Ash" },
      ]),
      setVoice: vi.fn(async () => undefined),
    },
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function call(patch: Partial<CallState> = {}): CallState {
  return {
    botId: "bot-1",
    botName: "Sunny",
    botColor: "violet",
    connectedAt: 1,
    phase: "listening",
    muted: false,
    caption: "",
    heard: "",
    exchanges: [],
    ...patch,
  };
}

function render(state: CallState | null, chatWidth = 900) {
  session.call = state;
  // The bar sizes itself from the chat it floats in, here the test container.
  Object.defineProperty(container, "clientWidth", { value: chatWidth, configurable: true });
  act(() =>
    root.render(
      <MemoryRouter>
        <CallBar />
      </MemoryRouter>,
    ),
  );
}

/** A fresh mount measures the chat again; jsdom has no ResizeObserver to do it live. */
function remount() {
  act(() => root.unmount());
  root = createRoot(container);
}

const button = (name: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const bar = () => container.querySelector<HTMLElement>('[data-testid="call-view"]');

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  session.ending = null;
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it("shows nothing without a call", () => {
  render(null);
  expect(bar()).toBeNull();
});

it("lays out the bot, then settings, transcript, mute and hang up, as in Grok", () => {
  render(call());
  const controls = Array.from(bar()?.querySelectorAll("button") ?? []).map((element) =>
    element.getAttribute("aria-label"),
  );
  expect(controls).toEqual(["Open chat with Sunny", "Settings", "Transcript", "Mute", "Hang up"]);
  expect(bar()?.querySelector('[role="progressbar"]')).toBeNull();
});

it("shows a sliding segment while the call connects", () => {
  render(call({ phase: "ringing", connectedAt: null }));
  expect(bar()?.querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Calling…");
});

it("mutes and hangs up through the call session", () => {
  render(call());
  act(() => button("Mute")?.click());
  expect(toggleMute).toHaveBeenCalledTimes(1);
  act(() => button("Hang up")?.click());
  expect(endCall).toHaveBeenCalledTimes(1);
  render(call({ muted: true }));
  expect(button("Unmute")?.getAttribute("aria-pressed")).toBe("true");
});

it("opens the transcript inside the bar, newest turn last", () => {
  render(
    call({
      exchanges: [
        { role: "bot", text: "Sunny here. What's on your plate?" },
        { role: "user", text: "Yeah, just testing." },
      ],
      caption: "Loud and clear.",
    }),
  );
  expect(bar()?.getAttribute("data-call-tray")).toBe("closed");
  act(() => button("Transcript")?.click());
  expect(bar()?.getAttribute("data-call-tray")).toBe("transcript");
  expect(button("Transcript")?.getAttribute("aria-expanded")).toBe("true");
  const log = bar()?.querySelector('[role="log"]');
  expect(
    Array.from(log?.firstElementChild?.children ?? []).map((turn) => turn.textContent),
  ).toEqual(["Sunny here. What's on your plate?", "Yeah, just testing.", "Loud and clear."]);
  act(() => button("Transcript")?.click());
  expect(bar()?.getAttribute("data-call-tray")).toBe("closed");
});

it("loads the voice as the call starts, so the picker opens on its name", async () => {
  await act(async () => render(call()));
  expect(rpc.voice.voices).toHaveBeenCalledWith({ provider: "scripted" });
  act(() => button("Settings")?.click());
  expect(bar()?.querySelector('[role="combobox"]')?.textContent).toContain("Liora");
  act(() => button("Transcript")?.click());
  act(() => button("Settings")?.click());
  expect(bar()?.querySelector('[role="combobox"]')?.textContent).toContain("Liora");
  expect(rpc.voice.voices).toHaveBeenCalledTimes(1);
});

it("keeps settings in the tray while it closes, never flashing the transcript", async () => {
  await act(async () => render(call({ exchanges: [{ role: "bot", text: "Hi." }] })));
  act(() => button("Settings")?.click());
  act(() => button("Settings")?.click());
  expect(bar()?.getAttribute("data-call-tray")).toBe("closed");
  expect(bar()?.querySelector('[role="combobox"]')).not.toBeNull();
  expect(bar()?.querySelector('[role="log"]')).toBeNull();
});

it("never shows the voice's raw id while the list is loading", () => {
  vi.mocked(rpc.voice.voices).mockReturnValueOnce(new Promise(() => undefined));
  render(call());
  act(() => button("Settings")?.click());
  expect(bar()?.querySelector('[role="combobox"]')).toBeNull();
  expect(bar()?.textContent).not.toContain("liora");
});

it("keeps Grok's full bar in a wide chat, and its compact form in a narrow one", () => {
  render(call(), 900);
  expect(bar()?.getAttribute("data-call-size")).toBe("full");
  remount();
  render(call(), 360);
  expect(bar()?.getAttribute("data-call-size")).toBe("compact");
  expect(button("Hang up")?.className).toContain("size-7");
  remount();
  render(call(), 285);
  expect(bar()?.getAttribute("data-call-size")).toBe("tight");
  // Every control stays; only the level line gives way.
  expect(button("Hang up")).not.toBeNull();
  expect(button("Open chat with Sunny")).not.toBeNull();
});

it("shows a sent turn once while the bot thinks about it", () => {
  render(
    call({
      phase: "thinking",
      heard: "This is a test.",
      exchanges: [{ role: "user", text: "This is a test." }],
    }),
  );
  act(() => button("Transcript")?.click());
  const log = bar()?.querySelector('[role="log"]');
  expect(
    Array.from(log?.firstElementChild?.children ?? []).map((turn) => turn.textContent),
  ).toEqual(["This is a test."]);
});

it("never lets the tray's content widen the bar, as in Grok", () => {
  render(call({ exchanges: [{ role: "bot", text: "A very long reply ".repeat(20) }] }));
  const tray = bar()?.querySelector("[data-call-tray-panel]");
  // Layout is not measurable in jsdom; inline-size containment is what keeps the width.
  expect(tray?.className).toContain("[contain:inline-size]");
});

it("keeps the bar, ending and inert, until the hung-up call has closed, as in Grok", () => {
  session.ending = call({ phase: "speaking" });
  render(null);
  expect(bar()?.getAttribute("data-call-phase")).toBe("ending");
  expect(bar()?.hasAttribute("inert")).toBe(true);
  // The level line gives way to the sliding segment, as while connecting.
  expect(bar()?.querySelector(".rk-call-pending")).not.toBeNull();
  session.ending = null;
  render(null);
  expect(bar()).toBeNull();
});

it("eases the tray between settings and the transcript instead of cutting", async () => {
  // jsdom has no layout: give the tray the heights of its two panels.
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.hasAttribute("data-call-tray-panel")) return 0;
      return this.querySelector('[role="log"]') ? 241 : 61;
    },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly measure: () => void) {}
      observe() {
        this.measure();
      }
      disconnect() {}
    },
  );
  try {
    await act(async () => render(call()));
    act(() => button("Transcript")?.click());
    act(() => button("Settings")?.click());
    const tray = bar()?.querySelector<HTMLElement>("[data-call-tray-panel]");
    // It eases from the transcript's height to the settings' with the tray's own transition.
    expect(tray?.style.height).toBe("61px");
    expect(tray?.className).toContain("transition-[grid-template-rows,height]");
    act(() => {
      tray?.dispatchEvent(Object.assign(new Event("transitionend"), { propertyName: "height" }));
    });
    expect(tray?.style.height).toBe("");
  } finally {
    if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    vi.unstubAllGlobals();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  }
});

it("hangs up on Escape", () => {
  render(call());
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(endCall).toHaveBeenCalledTimes(1);
});

// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallCard } from "../components/CallCard";
import { callPreferences, resetCallPreferencesForTests } from "./call-preferences";
import type { CallDeps, DictationHandlers } from "./call-session";
import { endCall, startCall } from "./call-session";

const voiceRpc = vi.hoisted(() => ({ update: vi.fn() }));

type Style = Record<string, unknown> | Style[] | false | null | undefined;
function flat(style: Style): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style;
}

vi.mock("expo-keep-awake", () => ({ useKeepAwake: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => true }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("react-native", () => {
  function View({ children, style }: { children?: ReactNode; style?: Style }) {
    const { backgroundColor } = flat(style);
    return createElement("div", { "data-bg": backgroundColor }, children);
  }
  return {
    View,
    ScrollView: View,
    Text: ({ children, style }: { children?: ReactNode; style?: Style }) =>
      createElement(
        "span",
        {
          "data-color": flat(style).color,
          "data-align": flat(style).alignSelf,
          "data-bg": flat(style).backgroundColor,
        },
        children,
      ),
    Pressable: (props: {
      children?: ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean };
    }) =>
      createElement(
        "button",
        {
          type: "button",
          onClick: props.onPress,
          "aria-label": props.accessibilityLabel,
          "aria-pressed": props.accessibilityState?.selected,
        },
        props.children,
      ),
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Linking: { openSettings: vi.fn() },
    Animated: {
      View,
      Value: class {
        setValue = vi.fn();
        interpolate = vi.fn();
      },
      loop: () => ({ start: vi.fn(), stop: vi.fn() }),
      sequence: vi.fn(),
      timing: () => ({ start: vi.fn() }),
      delay: vi.fn(),
    },
    Platform: { OS: "ios", Version: 18 },
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  };
});
vi.mock("./api", () => ({
  rpc: vi.fn(async (path: string, input: unknown) => {
    if (path === "voice/voices") {
      return [
        { id: "kepler", label: "Kepler" },
        { id: "vega", label: "Vega" },
      ];
    }
    if (path === "bots/get") return { voiceId: "kepler" };
    if (path === "bots/update") voiceRpc.update(input);
    return {};
  }),
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ t: (text: string) => text }),
  t: (text: string) => text,
  getActiveUiLocale: () => "en",
}));
vi.mock("./native", () => ({
  useMobileTokens: () => ({ foreground: "white", background: "black", muted: "grey" }),
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: () => null,
  useAvatarFill: (color: string) => color,
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("../components/menu-picker", () => ({
  MenuPicker: (props: {
    label: string;
    value: string;
    choices: { key: string; label: string }[];
    onChange: (key: string) => void;
  }) =>
    createElement(
      "label",
      null,
      props.label,
      createElement(
        "select",
        {
          "aria-label": props.label,
          value: props.value,
          onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
        },
        props.choices.map((choice) =>
          createElement("option", { key: choice.key, value: choice.key }, choice.label),
        ),
      ),
    ),
}));
vi.mock("./device-voice", () => ({ loadDeviceVoiceEnabled: async () => false }));
vi.mock("./bot-voices", () => ({}));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("./voice", () => ({ speakText: vi.fn(), stopSpeaking: vi.fn(), setCallAudio: vi.fn() }));
vi.mock("./dictation", () => ({ available: vi.fn(), listen: vi.fn(), access: vi.fn() }));
vi.mock("./call-sounds", () => ({ playCallCue: vi.fn() }));

describe("CallCard", () => {
  let root: Root;
  let container: HTMLDivElement;
  let heard: DictationHandlers | undefined;

  function deps(): CallDeps {
    return {
      micAccess: async () => "granted",
      callAudio: vi.fn(),
      dictate: async (handlers) => {
        heard = handlers;
        return true;
      },
      record: vi.fn(),
      transcribe: vi.fn(),
      send: vi.fn(async () => undefined),
      endCall: async () => undefined,
      speak: () => new Promise(() => undefined),
      watch: () => vi.fn(),
      stopSpeaking: vi.fn(),
      cue: async () => undefined,
      waitSound: vi.fn(),
    };
  }

  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const select = (label: string) =>
    container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    resetCallPreferencesForTests();
    voiceRpc.update.mockReset();
  });

  afterEach(() => {
    act(() => {
      endCall();
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  async function call(botColor: string) {
    act(() => root.render(<CallCard />));
    await act(async () => {
      startCall({ botId: "bot-1", botName: "Ada", botColor }, deps());
    });
  }

  it("draws the call bar's level bars in the bot's color when its avatar is a shape", async () => {
    await call("#F97316::shape_2");
    expect(container.querySelectorAll('[data-bg="#F97316"]').length).toBeGreaterThan(10);
    expect(container.querySelector('[data-bg="#F97316::shape_2"]')).toBeNull();
  });

  it("opens the call settings inside the full call from the gear, and lights the gear", async () => {
    await call("#22C55E");
    await act(async () => button("Settings")!.click());

    expect(button("Collapse")).not.toBeNull();
    expect(select("Speed")).not.toBeNull();
    expect(select("Language")?.value).toBe("auto");
    expect(button("Settings")!.getAttribute("aria-pressed")).toBe("true");
    expect(select("Voice")?.value).toBe("kepler");

    await act(async () => button("Settings")!.click());
    expect(select("Speed")).toBeNull();
    expect(button("Settings")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("saves the speed and language for calls, and the voice on the bot", async () => {
    await call("#22C55E");
    await act(async () => button("Settings")!.click());

    await act(async () => {
      const speed = select("Speed")!;
      speed.value = "1.5";
      speed.dispatchEvent(new Event("change", { bubbles: true }));
      const language = select("Language")!;
      language.value = "de-DE";
      language.dispatchEvent(new Event("change", { bubbles: true }));
      const voice = select("Voice")!;
      voice.value = "vega";
      voice.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(callPreferences()).toEqual({ speed: 1.5, language: "de-DE" });
    expect(voiceRpc.update).toHaveBeenCalledWith({ botId: "bot-1", voiceId: "vega" });
  });

  it("shows the caller's words as a plain grey line on the right", async () => {
    await call("#22C55E");
    await act(async () => heard?.onFinal("what is the update"));
    await act(async () => button("Expand")!.click());

    const line = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "what is the update",
    );
    expect(line?.dataset.align).toBe("flex-end");
    expect(line?.dataset.color).not.toBe("white");
    // No bubble behind it.
    expect(line?.dataset.bg).toBeUndefined();
  });
});

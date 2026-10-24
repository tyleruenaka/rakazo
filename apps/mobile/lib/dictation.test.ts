import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeechRecognizer } from "./dictation";
import {
  available,
  ENDPOINT_SILENCE_MS,
  listen,
  PERMISSION_TIMEOUT_MS,
  setSpeechRecognizer,
  stop,
} from "./dictation";

const device = vi.hoisted(() => ({
  locales: [{ languageTag: "en-US", languageCode: "en" }] as {
    languageTag: string;
    languageCode: string | null;
  }[],
}));
vi.mock("expo-localization", () => ({ getLocales: () => device.locales }));

type Listener = (payload: never) => void;

/** Longest restart delay the module backs off to. */
const RESTART_CAP_MS = 2_000;

/**
 * `supported` makes it behave like iOS: a language tag it does not list exactly (iOS lists
 * "en-US", never "en") fails with `language-not-supported` and ends, and the mic hears nothing.
 */
function fakeRecognizer(opts: { supported?: string[] } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  let running = false;
  const start = vi.fn((options: { lang: string }) => {
    if (opts.supported && !opts.supported.includes(options.lang)) {
      running = false;
      void Promise.resolve().then(() => {
        emit("error", { error: "language-not-supported", message: options.lang });
        emit("end", null);
      });
      return;
    }
    running = true;
  });
  const abort = vi.fn(() => {
    running = false;
  });
  const recognizer: SpeechRecognizer = {
    start,
    stop: vi.fn(),
    abort,
    isRecognitionAvailable: () => true,
    requestPermissionsAsync: async () => ({ granted: true }),
    addListener: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as Listener);
      listeners.set(event, set);
      return {
        remove: () => {
          set.delete(listener as Listener);
        },
      };
    },
  };
  const emit = (event: string, payload: unknown) => {
    for (const listener of [...(listeners.get(event) ?? [])])
      (listener as (p: unknown) => void)(payload);
  };
  return {
    recognizer,
    start,
    abort,
    hear: (transcript: string, isFinal = false) => {
      if (opts.supported && !running) return;
      emit("result", { isFinal, results: [{ transcript, confidence: 0.9 }] });
    },
    end: () => {
      running = false;
      emit("end", null);
    },
    fail: (error: string) => emit("error", { error, message: error }),
  };
}

let fake: ReturnType<typeof fakeRecognizer>;

beforeEach(() => {
  vi.useFakeTimers();
  device.locales = [{ languageTag: "en-US", languageCode: "en" }];
  fake = fakeRecognizer();
  setSpeechRecognizer(fake.recognizer);
});

afterEach(() => {
  stop();
  setSpeechRecognizer(null);
  vi.useRealTimers();
});

describe("mobile dictation", () => {
  it("ends the turn only after the silence window, not on the recognizer's own final", async () => {
    const onFinal = vi.fn();
    const interims: string[] = [];
    await listen({ onFinal, onInterim: (text) => interims.push(text) });
    expect(fake.start).toHaveBeenCalledWith({
      lang: "en-US",
      interimResults: true,
      continuous: true,
    });

    fake.hear("how is the");
    fake.hear("how is the", true);
    vi.advanceTimersByTime(ENDPOINT_SILENCE_MS - 400);
    expect(onFinal).not.toHaveBeenCalled();

    fake.hear("deploy going");
    vi.advanceTimersByTime(ENDPOINT_SILENCE_MS - 1);
    expect(onFinal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("how is the deploy going");
    expect(interims).toEqual(["how is the", "how is the", "how is the deploy going"]);
  });

  it("restarts a session that ended mid-turn and carries the words already heard", async () => {
    const onFinal = vi.fn();
    await listen({ onFinal });
    fake.hear("hello there");

    fake.end();
    expect(onFinal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(fake.start).toHaveBeenCalledTimes(2);

    fake.hear("friend");
    vi.advanceTimersByTime(ENDPOINT_SILENCE_MS);
    expect(onFinal).toHaveBeenCalledWith("hello there friend");
  });

  it("gives up after restarts that hear nothing", async () => {
    const onFinal = vi.fn();
    await listen({ onFinal });
    fake.hear("half a sentence");
    for (let attempt = 0; attempt < 6; attempt += 1) {
      fake.end();
      vi.advanceTimersByTime(RESTART_CAP_MS);
    }
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("half a sentence");
  });

  it("never finalizes an aborted session", async () => {
    const onFinal = vi.fn();
    const controller = new AbortController();
    await listen({ onFinal, signal: controller.signal });
    fake.hear("cancel this");

    controller.abort();
    expect(fake.abort).toHaveBeenCalled();
    fake.hear("and this", true);
    fake.end();
    vi.advanceTimersByTime(10_000);

    expect(onFinal).not.toHaveBeenCalled();
  });

  it("hears the caller on an iPhone when the app language is plain English", async () => {
    const iphone = fakeRecognizer({ supported: ["en-US", "en-GB", "de-DE", "zh-CN"] });
    setSpeechRecognizer(iphone.recognizer);
    const onFinal = vi.fn();
    await listen({ lang: "en", onFinal });
    await vi.advanceTimersByTimeAsync(0);

    iphone.hear("hello there");
    vi.advanceTimersByTime(ENDPOINT_SILENCE_MS);
    expect(onFinal).toHaveBeenCalledWith("hello there");
  });

  it("listens in the phone's own variant of the app language", async () => {
    device.locales = [{ languageTag: "en-GB", languageCode: "en" }];
    await listen({ lang: "en", onFinal: vi.fn() });
    expect(fake.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "en-GB" }));

    stop();
    device.locales = [{ languageTag: "fr-FR", languageCode: "fr" }];
    await listen({ lang: "de", onFinal: vi.fn() });
    expect(fake.start).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "de-DE" }));

    stop();
    await listen({ lang: "zh-CN", onFinal: vi.fn() });
    expect(fake.start).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "zh-CN" }));
  });

  it("says why when the recognizer cannot run, instead of going quiet", async () => {
    const iphone = fakeRecognizer({ supported: ["en-US"] });
    setSpeechRecognizer(iphone.recognizer);
    const onFinal = vi.fn();
    const onError = vi.fn();
    await listen({ lang: "tlh-QO", onFinal, onError });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onError).toHaveBeenCalledWith("language-not-supported");
    expect(onFinal).not.toHaveBeenCalled();
    expect(iphone.start).toHaveBeenCalledTimes(1);
  });

  it("hands back an empty turn when a quiet recognizer keeps stopping", async () => {
    const onFinal = vi.fn();
    await listen({ onFinal });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      fake.end();
      vi.advanceTimersByTime(RESTART_CAP_MS);
    }
    expect(onFinal).toHaveBeenCalledWith("");
  });

  it("stops waiting on a permission prompt that never answers", async () => {
    setSpeechRecognizer({
      ...fake.recognizer,
      requestPermissionsAsync: () => new Promise(() => undefined),
    });
    const answer = available();
    await vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS);
    await expect(answer).resolves.toBe(false);
  });

  it("ends the turn on a permission error instead of hanging on the mic", async () => {
    const onFinal = vi.fn();
    await listen({ onFinal });
    fake.hear("open the door");
    fake.fail("not-allowed");
    expect(onFinal).toHaveBeenCalledWith("open the door");
  });
});

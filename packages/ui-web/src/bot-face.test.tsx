// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotAvatar, eyeStrokes } from "./bot-avatar.js";
import { BotMotionProvider, SETTLED_MS } from "./bot-motion.js";

describe("bot faces", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
  });

  it("draws every face with the same curve shape, so any face can morph into any other", () => {
    const shape = (d: string) => d.replace(/-?\d+(\.\d+)?/g, "n");
    const faces = ["open", "forward", "happy", "sad", "confused", "sleepy", "calm"] as const;
    const shapes = new Set(
      faces.flatMap((face) => eyeStrokes(face, 259, 40).map((eye) => shape(eye.d))),
    );
    expect([...shapes]).toEqual(["M n n Q n n n n"]);
  });

  it("morphs the eyes from happy back to open instead of cutting", async () => {
    const root = createRoot(host);
    const avatar = (motion: "done" | "idle") => (
      <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={40} motion={motion} />
    );
    await act(async () => root.render(avatar("done")));
    const eye = () => host.querySelector(".rakazo-character-eye")?.getAttribute("d") ?? "";
    const happy = eye();
    expect(happy).toBe(eyeStrokes("happy", 259, 40)[0]?.d);
    await act(async () => root.render(avatar("idle")));
    // Right after the switch the eyes still show the happy curve; no frame jumps to open.
    expect(eye()).toBe(happy);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 90)));
    const midway = eye();
    expect(midway).not.toBe(happy);
    expect(midway).not.toBe(eyeStrokes("open", 259, 40)[0]?.d);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(eye()).toBe(eyeStrokes("open", 259, 40)[0]?.d);
    await act(async () => root.unmount());
  });

  it("ends a done face by itself after SETTLED_MS", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const root = createRoot(host);
    const now = Date.now();
    await act(async () =>
      root.render(
        <BotMotionProvider
          value={new Map([["maya", "done" as const]])}
          since={new Map([["maya", now]])}
        >
          <BotAvatar color="#8B5CF6::shape_0" identity="maya" size={40} animated />
        </BotMotionProvider>,
      ),
    );
    const motion = () => host.querySelector(".rakazo-character")?.getAttribute("data-motion");
    expect(motion()).toBe("done");
    await act(async () => vi.advanceTimersByTime(SETTLED_MS - 10));
    expect(motion()).toBe("done");
    await act(async () => vi.advanceTimersByTime(20));
    expect(motion()).toBe("idle");
    await act(async () => root.unmount());
    vi.useRealTimers();
  });
});

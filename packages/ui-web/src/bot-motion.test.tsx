// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAvatarGaze } from "./bot-motion.js";

function Row() {
  useAvatarGaze();
  return (
    <button type="button" data-avatar-gaze="">
      <svg className="rakazo-character" aria-hidden="true" />
      <span>Ezra</span>
    </button>
  );
}

describe("useAvatarGaze", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    // A steady 60fps frame clock.
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

  it("turns a row's avatar toward the pointer and lets it rest when the pointer leaves", async () => {
    const root = createRoot(host);
    await act(async () => root.render(<Row />));
    const avatar = host.querySelector<SVGElement>(".rakazo-character");
    const name = host.querySelector("span");
    if (!avatar || !name) throw new Error("row not rendered");
    avatar.getBoundingClientRect = () => ({ left: 10, top: 10, width: 40, height: 40 }) as DOMRect;

    const settle = () => new Promise((resolve) => setTimeout(resolve, 900));
    const gaze = () => [
      Number(avatar.style.getPropertyValue("--rk-gaze-x")),
      Number(avatar.style.getPropertyValue("--rk-gaze-y")),
    ];

    // Over the name, far right of the avatar and level with it: it eases to fully turned right.
    name.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 30 }));
    await settle();
    expect(gaze()[0]).toBeCloseTo(1, 2);
    expect(gaze()[1]).toBeCloseTo(0, 2);

    // Half way to the avatar's left edge, a little above center.
    avatar.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 25 }),
    );
    await settle();
    expect(gaze()[0]).toBeCloseTo(-0.5, 2);
    expect(gaze()[1]).toBeCloseTo(-0.25, 2);

    // Leaving every marked container lets it ease back and rest.
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 600 }));
    await settle();
    expect(avatar.style.getPropertyValue("--rk-gaze-x")).toBe("");
    await act(async () => root.unmount());
  });
});

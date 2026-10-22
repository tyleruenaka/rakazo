import type { BotMotion } from "@rakazo/core";
import { SETTLED_MS } from "@rakazo/core";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

export type { BotMotion, CallAvatarState } from "@rakazo/core";
export { CALL_MOTIONS, SETTLED_MS } from "@rakazo/core";

type LiveMotions = {
  motions: ReadonlyMap<string, BotMotion>;
  since: ReadonlyMap<string, number>;
};

const BotMotionContext = createContext<LiveMotions>({ motions: new Map(), since: new Map() });

/**
 * Live motion by bot id, so every avatar of a working bot shows the same state. `since` is when
 * each motion began; a done or failed face ends by itself after SETTLED_MS.
 */
export function BotMotionProvider({
  value,
  since = new Map(),
  children,
}: {
  value: ReadonlyMap<string, BotMotion>;
  since?: ReadonlyMap<string, number>;
  children: ReactNode;
}) {
  return <BotMotionContext value={{ motions: value, since }}>{children}</BotMotionContext>;
}

export function useLiveBotMotion(botId: string): BotMotion | undefined {
  const { motions, since } = useContext(BotMotionContext);
  const motion = motions.get(botId);
  const settled = motion === "done" || motion === "failed";
  const endsAt = settled ? (since.get(botId) ?? 0) + SETTLED_MS : 0;
  // Only this avatar re-renders when its face expires, not the page around it.
  const [, expire] = useState(0);
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => expire((n) => n + 1), Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [settled, endsAt]);
  return settled && Date.now() >= endsAt ? undefined : motion;
}

/** Containers marked with this attribute make the avatar inside them look at the pointer. */
const AVATAR_GAZE_ATTRIBUTE = "data-avatar-gaze";

const clampGaze = (value: number) => Math.max(-1, Math.min(1, value));

/** Grok's gaze follow: each 60fps frame closes 14% of the gap (about 110ms to settle a third). */
const followRate = (seconds: number) => 1 - 0.86 ** (seconds * 60);

type Gaze = { x: number; y: number; targetX: number; targetY: number; released: boolean };

/**
 * Grok's hover gaze: while the pointer moves over a marked container (a roster row, a pinned
 * tile, the panel header), its avatar turns toward it, fully once the pointer is past the
 * avatar's edge, and eases back when the pointer leaves. One listener for the whole document;
 * one animation frame loop runs only while an avatar is moving.
 */
export function useAvatarGaze() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gazes = new Map<HTMLElement | SVGElement, Gaze>();
    let looking: HTMLElement | SVGElement | null = null;
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      const rate = followRate(Math.min((now - last) / 1000, 0.1));
      last = now;
      for (const [avatar, gaze] of gazes) {
        gaze.x += (gaze.targetX - gaze.x) * rate;
        gaze.y += (gaze.targetY - gaze.y) * rate;
        const settled =
          Math.abs(gaze.targetX - gaze.x) < 0.002 && Math.abs(gaze.targetY - gaze.y) < 0.002;
        if (settled && gaze.released) {
          avatar.style.removeProperty("--rk-gaze-x");
          avatar.style.removeProperty("--rk-gaze-y");
          // At rest the face carries no transform at all, so it draws exactly as it always has.
          avatar.removeAttribute("data-gazing");
          gazes.delete(avatar);
          continue;
        }
        if (settled) {
          gaze.x = gaze.targetX;
          gaze.y = gaze.targetY;
        }
        avatar.style.setProperty("--rk-gaze-x", gaze.x.toFixed(3));
        avatar.style.setProperty("--rk-gaze-y", gaze.y.toFixed(3));
      }
      frame = gazes.size > 0 ? requestAnimationFrame(step) : 0;
    };
    const run = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };
    const release = () => {
      const gaze = looking ? gazes.get(looking) : undefined;
      if (gaze) Object.assign(gaze, { targetX: 0, targetY: 0, released: true });
      looking = null;
      run();
    };
    const look = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const avatar =
        target
          ?.closest(`[${AVATAR_GAZE_ATTRIBUTE}]`)
          ?.querySelector<HTMLElement | SVGElement>(".rakazo-character") ?? null;
      if (avatar !== looking) release();
      if (!avatar) return;
      looking = avatar;
      const box = avatar.getBoundingClientRect();
      const reach = Math.max(box.width, 1) / 2;
      const gaze = gazes.get(avatar) ?? { x: 0, y: 0, targetX: 0, targetY: 0, released: false };
      gaze.targetX = clampGaze((event.clientX - box.left - box.width / 2) / reach);
      gaze.targetY = clampGaze((event.clientY - box.top - box.height / 2) / reach);
      gaze.released = false;
      gazes.set(avatar, gaze);
      avatar.setAttribute("data-gazing", "");
      run();
    };
    document.addEventListener("pointermove", look, { passive: true });
    document.documentElement.addEventListener("pointerleave", release);
    return () => {
      cancelAnimationFrame(frame);
      for (const avatar of gazes.keys()) {
        avatar.style.removeProperty("--rk-gaze-x");
        avatar.style.removeProperty("--rk-gaze-y");
        avatar.removeAttribute("data-gazing");
      }
      document.removeEventListener("pointermove", look);
      document.documentElement.removeEventListener("pointerleave", release);
    };
  }, []);
}

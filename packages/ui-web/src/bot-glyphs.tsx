import type { BotFace, GlyphCircle, GlyphMotion } from "@rakazo/core";
import {
  DOZE_AFTER_MS,
  faceForMotion,
  GLYPH_CORE_RADIUS,
  GLYPH_SCALE,
  GLYPH_UNIT,
  isGlyphMotion,
  orbitDot as orbitFrame,
  PENCIL_INK,
  PENCIL_WRITE,
  pencilTip,
  radarRing as radarFrame,
  sendCoreRadius,
  sendLaunch as sendLaunchFrame,
  sendPacket as sendPacketFrame,
  sendTrail as sendTrailFrame,
} from "@rakazo/core";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Morph faces: while a bot searches, writes, creates, messages or waits, its body folds into a
 * small core and a moving figure plays around it. Geometry and timing use a 229-unit canvas
 * (`MARK_UNIT`), scaled to the avatar.
 */
export { type GlyphMotion, isGlyphMotion };

const MARK_UNIT = GLYPH_UNIT;
const CORE_RADIUS = GLYPH_CORE_RADIUS;
const STEPS = 48;

const round = (value: number) => Math.round(value * 100) / 100;

type Frame = Record<string, number>;

const reducedMotionMedia = "(prefers-reduced-motion: reduce)";

function reducedMotionSnapshot(): boolean {
  return window.matchMedia(reducedMotionMedia).matches;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(reducedMotionMedia);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotion, reducedMotionSnapshot, () => false);
}

/**
 * A looping circle: `frame(p)` gives its attributes at phase p (0..1) in Grok units relative
 * to the center; `toUnits` turns them into viewBox values. Still mode draws one frame.
 */
function Looping({
  period,
  offset = 0,
  frame,
  toUnits,
  still,
  props,
}: {
  period: number;
  offset?: number;
  frame: (p: number) => Frame;
  toUnits: (attr: string, value: number) => number;
  still: boolean;
  props?: Record<string, string | number>;
}) {
  const at = (p: number) => {
    const values = frame((((p + offset) % 1) + 1) % 1);
    return Object.fromEntries(
      Object.entries(values).map(([attr, value]) => [attr, round(toUnits(attr, value))]),
    );
  };
  const rest = at(0.3);
  if (still) return <circle {...props} {...rest} />;
  const samples = Array.from({ length: STEPS + 1 }, (_, step) => at(step / STEPS));
  const animations = Object.keys(rest).map((attr) => (
    <animate
      key={attr}
      attributeName={attr === "strokeWidth" ? "stroke-width" : attr}
      values={samples.map((sample) => sample[attr]).join(";")}
      dur={`${period}s`}
      repeatCount="indefinite"
    />
  ));
  return (
    <circle {...props} {...rest}>
      {animations}
    </circle>
  );
}

/** A core figure circle as the SVG attributes the loop animates. */
const circleFrame = (circle: GlyphCircle): Frame => ({
  ...(circle.cx || circle.cy ? { cx: circle.cx, cy: circle.cy } : {}),
  r: circle.r,
  ...(circle.stroke === undefined ? {} : { strokeWidth: circle.stroke }),
  opacity: circle.opacity,
});

/** Radar: three rings swell out of the core every 1.3s, thinning and fading. */
function radarRing(core: number, offset: number) {
  return { offset, frame: (p: number): Frame => circleFrame(radarFrame(core, p)) };
}

/** Orbit: five dots circle the core on a tilted ellipse every 3.7s, bigger in front. */
function orbitDot(offset: number) {
  return {
    offset,
    frame: (p: number): Frame => {
      const c = orbitFrame(p);
      return { cx: c.cx, cy: c.cy, r: c.r, opacity: c.opacity };
    },
  };
}

/** Send: a packet and its trail fly up and right every 1.5s as a ring launches from the core. */
function sendPacket(p: number): Frame {
  const c = sendPacketFrame(p);
  return { cx: c.cx, cy: c.cy, r: c.r, opacity: c.opacity };
}
function sendTrail(p: number): Frame {
  const c = sendTrailFrame(p);
  return { cx: c.cx, cy: c.cy, r: c.r, opacity: c.opacity };
}
function sendLaunch(p: number): Frame {
  const c = sendLaunchFrame(p);
  return { r: c.r, strokeWidth: c.stroke ?? 0, opacity: c.opacity };
}
function sendCore(p: number): Frame {
  return { r: sendCoreRadius(p) };
}

/** Pencil, 2.5s: the tip writes a wavy line for 68% of the loop, then lifts and returns. */
const PENCIL_PERIOD = 2.5;

/** How long a leaving figure stays mounted: its core swells back into the body meanwhile. */
const GLYPH_FADE_MS = 200;

type GlyphProps = { center: number; unit: number; size: number; fill: string };

/** The current morph figure, kept briefly after the state ends so it fades instead of popping. */
export function GlyphLayer({ motion, ...props }: GlyphProps & { motion: string | undefined }) {
  const current = motion && isGlyphMotion(motion) ? motion : null;
  const [shown, setShown] = useState(current);
  if (current && current !== shown) setShown(current);
  useEffect(() => {
    if (current || !shown) return;
    const timer = setTimeout(() => setShown(null), GLYPH_FADE_MS);
    return () => clearTimeout(timer);
  }, [current, shown]);
  if (!shown) return null;
  return <MorphGlyph key={shown} motion={shown} leaving={!current} {...props} />;
}

function MorphGlyph({
  motion,
  leaving,
  center,
  unit,
  size,
  fill,
}: GlyphProps & { motion: GlyphMotion; leaving: boolean }) {
  const still = useReducedMotion();
  const scale = (GLYPH_SCALE[motion] * 0.85 * unit) / MARK_UNIT;
  // Hairline figures stay at least a device pixel wide in small avatars.
  const minStroke = (0.75 * unit) / size;
  const toUnits = (attr: string, value: number) => {
    if (attr === "cx" || attr === "cy") return center + value * scale;
    if (attr === "strokeWidth") return Math.max(value * scale, value > 0 ? minStroke : 0);
    if (attr === "opacity") return value;
    return value * scale;
  };
  const core = CORE_RADIUS[motion];
  const ringProps = { cx: center, cy: center, fill: "none", stroke: fill };
  let figure: ReactNode;
  if (motion === "searching") {
    figure = [0, 1, 2].map((ring) => (
      <Looping
        key={ring}
        period={1.3}
        {...radarRing(core, ring / 3)}
        toUnits={toUnits}
        still={still}
        props={ringProps}
      />
    ));
  } else if (motion === "waiting") {
    figure = [0, 1, 2, 3, 4].map((dot) => (
      <Looping key={dot} period={3.7} {...orbitDot(dot / 5)} toUnits={toUnits} still={still} />
    ));
  } else if (motion === "messaging") {
    figure = (
      <>
        <Looping
          period={1.5}
          frame={sendLaunch}
          toUnits={toUnits}
          still={still}
          props={ringProps}
        />
        <Looping period={1.5} frame={sendTrail} toUnits={toUnits} still={still} />
        <Looping period={1.5} frame={sendPacket} toUnits={toUnits} still={still} />
      </>
    );
  } else if (motion === "creating") {
    // A faint track and an arc that fills from 12 o'clock over 2.1s of each 2.5s shot.
    const radius = round(62 * scale);
    const width = round(Math.max(5 * scale, minStroke));
    figure = (
      <g transform={`rotate(-90 ${center} ${center})`}>
        <circle {...ringProps} r={radius} strokeWidth={width} opacity={0.16} />
        <circle
          {...ringProps}
          r={radius}
          strokeWidth={width}
          pathLength={1}
          strokeDasharray={still ? "0.6 1" : "0 1"}
        >
          {still ? null : (
            <animate
              attributeName="stroke-dasharray"
              values="0 1;1 0;1 0"
              keyTimes="0;0.85;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </g>
    );
  } else {
    figure = (
      <Pencil center={center} scale={scale} minStroke={minStroke} fill={fill} still={still} />
    );
  }
  return (
    <g className="rakazo-character-glyph" data-leaving={leaving || undefined} style={{ fill }}>
      {motion === "messaging" ? (
        <Looping
          period={1.5}
          frame={sendCore}
          toUnits={toUnits}
          still={still}
          props={{ cx: center, cy: center, className: "rakazo-character-core" }}
        />
      ) : motion === "writing" ? null : (
        <circle className="rakazo-character-core" cx={center} cy={center} r={round(core * scale)} />
      )}
      <g className="rakazo-character-figure">{figure}</g>
    </g>
  );
}

/** The writing figure: core as the tip, a pencil shaft above it, and the ink it leaves. */
function Pencil({
  center,
  scale,
  minStroke,
  fill,
  still,
}: {
  center: number;
  scale: number;
  minStroke: number;
  fill: string;
  still: boolean;
}) {
  const ink = PENCIL_INK.map(
    ([x, y], index) =>
      `${index === 0 ? "M" : "L"}${round(center + x * scale)} ${round(center + y * scale)}`,
  ).join(" ");
  const place = (p: number) => {
    const tip = pencilTip(p);
    return `${round(center + tip.x * scale)} ${round(center + tip.y * scale)}`;
  };
  const tilt = (p: number) => round(pencilTip(p).rot);
  const samples = Array.from({ length: STEPS + 1 }, (_, step) => step / STEPS);
  const core = round(17 * scale);
  // Rakazo's pencil: a rounded shaft leaning 17deg, its point sitting on the core.
  const shaft = {
    x: round(-9 * scale),
    y: round(-96 * scale),
    width: round(18 * scale),
    height: round(78 * scale),
    rx: round(5 * scale),
  };
  return (
    <>
      <path
        d={ink}
        fill="none"
        stroke={fill}
        strokeWidth={round(Math.max(6 * scale, minStroke))}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={still ? 0 : 1}
      >
        {still ? null : (
          <animate
            attributeName="stroke-dashoffset"
            values="1;0;0;-1;-1"
            keyTimes={`0;${PENCIL_WRITE};${PENCIL_WRITE + 0.02};0.9;1`}
            keySplines="0.42 0 0.58 1;0 0 1 1;0.42 0 0.58 1;0 0 1 1"
            calcMode="spline"
            dur={`${PENCIL_PERIOD}s`}
            repeatCount="indefinite"
          />
        )}
      </path>
      <g transform={`translate(${place(0.3)})`}>
        {still ? null : (
          <animateTransform
            attributeName="transform"
            type="translate"
            values={samples.map(place).join(";")}
            dur={`${PENCIL_PERIOD}s`}
            repeatCount="indefinite"
          />
        )}
        <g transform={`rotate(${tilt(0.3)})`}>
          {still ? null : (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values={samples.map(tilt).join(";")}
              dur={`${PENCIL_PERIOD}s`}
              repeatCount="indefinite"
            />
          )}
          <circle className="rakazo-character-core" r={core} />
          <rect {...shaft} />
          <path
            d={`M${round(-9 * scale)} ${round(-18 * scale)} L0 ${round(-2 * scale)} L${round(9 * scale)} ${round(-18 * scale)} Z`}
          />
        </g>
      </g>
    </>
  );
}

/** Layers whose pose a state switch blends: body, eyes, the eye drift, the organic blob's path. */
const BRIDGED =
  ".rakazo-character-body, .rakazo-character-eyes, .rakazo-character-gaze, .rakazo-organic-avatar-body";
/** Grok's clip bridge: 500ms, cubic-bezier(.42, 0, .58, 1). */
const BRIDGE = { duration: 500, easing: "cubic-bezier(0.42, 0, 0.58, 1)" };
const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Radius of the round shape the body folds through, as a fraction of the avatar box. */
const BODY_ROUND = 0.44;
/** Side thinking dots sit this many of their own widths from the middle one. */
const SIDE_DOT_OFFSET = "137.5%";
/** Measured on Grok at 30fps: rounding takes ~100ms, the shrink or swell ~200ms more. */
const ROUND_MS = 100;
const MORPH_MS = 330;
const EASE = "cubic-bezier(0.42, 0, 0.58, 1)";

const matrixOf = (transform: string) =>
  transform && transform !== "none" ? new DOMMatrix(transform) : new DOMMatrix();

const isMorph = (motion: string | undefined) =>
  motion === "thinking" || (motion !== undefined && isGlyphMotion(motion));

/** Run a morph Web Animation if the element supports it (test DOMs don't). */
function play(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  if (!element || typeof element.animate !== "function") return null;
  return hold(element.animate(keyframes, { ...options, id: "rakazo-morph" }));
}

/**
 * A state switch often comes with long renders (a new message, a run ending). Its animations are
 * created paused on their first pose and then driven by a frame clock that starts on the first
 * painted frame and never advances more than two frames at once, so a frozen page delays a
 * morph instead of eating it.
 */
let held: Animation[] = [];

function hold(animation: Animation): Animation {
  animation.pause();
  held.push(animation);
  return animation;
}

function startHeld() {
  let batch = held;
  held = [];
  if (batch.length === 0) return;
  let last = -1;
  const step = (now: number) => {
    const dt = last < 0 ? 0 : Math.min(now - last, MAX_FRAME_MS);
    last = now;
    batch = batch.filter((animation) => {
      // Cancelled by a newer switch, or played normally elsewhere.
      if (animation.playState !== "paused") return false;
      const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
      const time = Number(animation.currentTime ?? 0) + dt;
      if (time >= end) {
        animation.finish();
        return false;
      }
      animation.currentTime = time;
      return true;
    });
    if (batch.length > 0) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A new switch replaces the previous one's morph instead of stacking on it. */
function cancelMorphs(root: Element) {
  for (const element of root.querySelectorAll("*")) {
    for (const running of element.getAnimations?.() ?? []) {
      if (running.id === "rakazo-morph") running.cancel();
    }
  }
}

/**
 * Grok's morph between the body and a folded face (thinking dots or a figure's core), frame by
 * frame from a 30fps capture. Folding: the body rounds into a body-sized circle as its eyes turn
 * away, then the circle shrinks into the core while the side dots bud out of it. Unfolding: the
 * side dots melt back as the core swells to the body's size, then the circle becomes the body
 * and its eyes turn in from the side.
 */
function morph(root: Element, folding: boolean, thinking: boolean) {
  const unit = root instanceof SVGSVGElement ? root.viewBox.baseVal.width : 0;
  const body = root.querySelector(".rakazo-character-body");
  const eyes = root.querySelector(".rakazo-character-eyes");
  const dots = root.querySelector(".rakazo-character-dots");
  const core = thinking
    ? root.querySelector(".rakazo-character-dots circle:nth-child(2)")
    : root.querySelector(".rakazo-character-glyph .rakazo-character-core");
  const sides = thinking
    ? [
        root.querySelector(".rakazo-character-dots circle:nth-child(1)"),
        root.querySelector(".rakazo-character-dots circle:nth-child(3)"),
      ]
    : [];
  const figure = thinking ? null : root.querySelector(".rakazo-character-figure");
  const radius = core instanceof SVGCircleElement ? core.r.baseVal.value : 0;
  const swell = radius > 0 && unit > 0 ? (BODY_ROUND * unit) / radius : 3;
  const round = ROUND_MS / MORPH_MS;
  const side = (index: number) =>
    `translateX(${index === 0 ? SIDE_DOT_OFFSET : `-${SIDE_DOT_OFFSET}`}) scale(0.25)`;
  const add = { composite: "add" as const };
  if (folding) {
    // The body stays opaque while it rounds, then hands over to the circle.
    play(body, [{ opacity: 1 }, { opacity: 1, offset: 0.99 }, { opacity: 0 }], {
      duration: ROUND_MS,
    });
    // It shrinks under the circle so corners and points tuck in rather than poke out.
    play(body, [{ transform: "none" }, { transform: "scale(0.7)" }], {
      duration: ROUND_MS,
      easing: "ease-in",
      ...add,
    });
    play(eyes, [{ transform: "none" }, { transform: "translateX(30%) scaleX(0.4)" }], {
      duration: ROUND_MS,
      easing: "ease-in",
      ...add,
    });
    play(
      core,
      [
        { transform: `scale(${swell * 0.8})` },
        { transform: `scale(${swell * 0.8})`, offset: round, easing: EASE },
        { transform: "none" },
      ],
      { duration: MORPH_MS, ...add },
    );
    play(core, [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, {}], { duration: MORPH_MS });
    sides.forEach((dot, index) => {
      play(dot, [{ transform: side(index) }, { transform: "none" }], {
        duration: MORPH_MS - ROUND_MS,
        delay: ROUND_MS + 60,
        easing: EASE,
        fill: "backwards",
        ...add,
      });
      play(dot, [{ opacity: 0 }, {}], {
        duration: MORPH_MS - ROUND_MS,
        delay: ROUND_MS + 60,
        fill: "backwards",
      });
    });
    play(figure, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      delay: ROUND_MS + 60,
      fill: "backwards",
    });
    return;
  }
  const swellMs = MORPH_MS - ROUND_MS;
  if (thinking && dots instanceof SVGElement) {
    // The dots are hidden at rest; keep them drawn while they melt into the swelling core.
    dots.style.display = "inline";
    const shown = play(dots, [{ opacity: 1 }, { opacity: 1 }], { duration: swellMs + 40 });
    const hide = () => dots.style.removeProperty("display");
    if (shown) shown.finished.then(hide, hide);
    else hide();
  }
  play(core, [{ transform: "none" }, { transform: `scale(${swell})` }], {
    duration: swellMs + 40,
    easing: "cubic-bezier(0.42, 0, 1, 1)",
    ...add,
  });
  // A leaving figure stays mounted a moment longer, so its core must stay cleared.
  play(core, [{}, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], {
    duration: swellMs + 40,
    fill: thinking ? "none" : "forwards",
  });
  sides.forEach((dot, index) => {
    play(dot, [{ transform: "none" }, { transform: side(index) }], {
      duration: 150,
      easing: "ease-in",
      ...add,
    });
    play(dot, [{}, { opacity: 0 }], { duration: 150 });
  });
  play(figure, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
  play(body, [{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }], {
    duration: swellMs,
  });
  for (const running of body?.getAnimations() ?? []) {
    if (running.id === "rakazo-bridge") running.cancel();
  }
  play(body, [{ transform: "scale(0.9)" }, { transform: "none" }], {
    duration: ROUND_MS * 2,
    delay: swellMs,
    easing: SETTLE,
    fill: "backwards",
    ...add,
  });
  play(eyes, [{ transform: "translateX(-30%) scaleX(0.4)" }, { transform: "none" }], {
    duration: ROUND_MS * 1.6,
    delay: swellMs,
    easing: SETTLE,
    fill: "backwards",
    ...add,
  });
}

/** The face each state makes; anything else keeps its eyes open. */

/** The face a state makes, switching blocked to sleepy once it has waited two minutes. */
export function useBotFace(motion: string | undefined): BotFace {
  const blocked = motion === "blocked";
  const [dozing, setDozing] = useState(false);
  useEffect(() => {
    setDozing(false);
    if (!blocked) return;
    const timer = setTimeout(() => setDozing(true), DOZE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [blocked]);
  return faceForMotion(motion, dozing);
}

/** Grok's expression blend, measured at ~3 frames; a touch longer reads as a morph, not a cut. */
const FACE_MORPH_MS = 180;
/** A morph frame never advances by more than two 60fps frames, even after a stall. */
const MAX_FRAME_MS = 33;
const NUMBER = /-?\d+(?:\.\d+)?/g;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Interpolate two `M Q` curves number by number (every face shares that shape). */
function lerpPath(from: string, to: string, t: number): string {
  const a = from.match(NUMBER)?.map(Number) ?? [];
  let index = 0;
  return to.replace(NUMBER, (value) => {
    const start = a[index++];
    return start === undefined
      ? value
      : String(Math.round((start + (Number(value) - start) * t) * 100) / 100);
  });
}

/**
 * Grok blends every state switch instead of cutting to the new animation. Before the new state
 * commits, read each layer's pose; after, add a 500ms animation that starts at the difference
 * and fades to nothing, so the new loop takes over without a jump. Switches into or out of a
 * folded face morph instead.
 */
export function useMotionBridge<T extends Element>(motion: string | undefined, face: BotFace) {
  const ref = useRef<T>(null);
  const shown = useRef(motion);
  const poses = useRef<Map<Element, string> | null>(null);
  const dotPoses = useRef<Map<Element, [string, string]> | null>(null);
  const still = useReducedMotion();
  const shownFace = useRef(face);
  const eyes = useRef<[Element, string, string][] | null>(null);
  const faceFrame = useRef(0);
  // Read the eyes' current curves (possibly mid-morph) before the new face renders.
  if (face !== shownFace.current && !eyes.current && ref.current && !still) {
    eyes.current = [...ref.current.querySelectorAll(".rakazo-character-eye")].map((eye) => [
      eye,
      eye.getAttribute("d") ?? "",
      eye.getAttribute("stroke-width") ?? "",
    ]);
  }
  useLayoutEffect(() => {
    if (face === shownFace.current) return;
    shownFace.current = face;
    const outgoing = eyes.current;
    eyes.current = null;
    if (!outgoing) return;
    cancelAnimationFrame(faceFrame.current);
    // React has drawn the new face; put the old curves back before paint and morph across.
    const targets = outgoing.map(([eye, d, width]) => {
      const target = [eye.getAttribute("d") ?? "", eye.getAttribute("stroke-width") ?? ""] as const;
      eye.setAttribute("d", d);
      eye.setAttribute("stroke-width", width);
      return {
        eye,
        from: [d, Number(width)] as const,
        to: [target[0], Number(target[1])] as const,
      };
    });
    // The resting rects step aside for the curves while they morph.
    const root = ref.current;
    const rests = [...(root?.querySelectorAll(".rakazo-character-eye-rest") ?? [])];
    const curves = targets.map(({ eye }) => eye);
    for (const rest of rests) rest.setAttribute("visibility", "hidden");
    for (const curve of curves) curve.setAttribute("visibility", "visible");
    const settle = () => {
      if (face !== "open") return;
      for (const rest of rests) rest.removeAttribute("visibility");
      for (const curve of curves) curve.setAttribute("visibility", "hidden");
    };
    // The clock starts at the first painted frame and never jumps more than two frames, so a
    // busy main thread around a state change (a long render) can't swallow the blend.
    let elapsed = -1;
    let last = 0;
    const step = (now: number) => {
      elapsed = elapsed < 0 ? 0 : elapsed + Math.min(now - last, MAX_FRAME_MS);
      last = now;
      const t = easeInOut(Math.min(1, elapsed / FACE_MORPH_MS));
      for (const { eye, from, to } of targets) {
        eye.setAttribute("d", lerpPath(from[0], to[0], t));
        eye.setAttribute(
          "stroke-width",
          String(Math.round((from[1] + (to[1] - from[1]) * t) * 100) / 100),
        );
      }
      if (t < 1) faceFrame.current = requestAnimationFrame(step);
      else settle();
    };
    faceFrame.current = requestAnimationFrame(step);
  }, [face]);
  useEffect(() => () => cancelAnimationFrame(faceFrame.current), []);
  // Read the outgoing pose during the render that changes the state, before the DOM updates.
  if (motion !== shown.current && !poses.current && ref.current && !still) {
    // The dots' wave stops the moment thinking ends; keep where each dot was in it.
    dotPoses.current =
      shown.current === "thinking"
        ? new Map(
            [...ref.current.querySelectorAll(".rakazo-character-dots circle")].map((dot) => {
              const style = getComputedStyle(dot);
              return [dot, [style.transform, style.opacity]];
            }),
          )
        : null;
    poses.current = new Map(
      [...ref.current.querySelectorAll(BRIDGED)].map((layer) => [
        layer,
        getComputedStyle(layer).transform,
      ]),
    );
  }
  useLayoutEffect(() => {
    if (motion === shown.current) return;
    const previous = shown.current;
    shown.current = motion;
    const outgoing = poses.current;
    poses.current = null;
    // Test DOMs have no matrix or Web Animations support; there is nothing to blend there.
    if (!outgoing || typeof DOMMatrix === "undefined") return;
    for (const [layer, from] of outgoing) {
      if (typeof layer.animate !== "function") continue;
      for (const running of layer.getAnimations()) {
        if (running.id === "rakazo-bridge") running.cancel();
      }
      const offset = matrixOf(getComputedStyle(layer).transform).inverse().multiply(matrixOf(from));
      if (offset.isIdentity) continue;
      const bridge = hold(
        layer.animate([{ transform: offset.toString() }, { transform: "none" }], {
          ...BRIDGE,
          composite: "add",
        }),
      );
      bridge.id = "rakazo-bridge";
    }
    const root = ref.current;
    // Each dot starts from its pose in the wave and eases to rest, under the unfold.
    // (Its own id, so the morph about to start doesn't cancel it.)
    for (const [dot, [transform, opacity]] of dotPoses.current ?? []) {
      if (typeof dot.animate !== "function") continue;
      hold(
        dot.animate([{ transform: transform === "none" ? "scale(1)" : transform, opacity }, {}], {
          duration: 150,
          easing: BRIDGE.easing,
          id: "rakazo-dot-pose",
        }),
      );
    }
    dotPoses.current = null;
    const folding = isMorph(motion);
    if (root && folding !== isMorph(previous)) {
      // A new morph replaces one still running; a plain switch (typing to done, 50ms after the
      // unfold began) must not cut the unfold short.
      cancelMorphs(root);
      morph(root, folding, (folding ? motion : previous) === "thinking");
    } else if (root && folding) {
      cancelMorphs(root);
      // One folded face to another: the dots or the new figure cross-fade around the core.
      const fade = { duration: 220, easing: BRIDGE.easing };
      const dots = root.querySelector(".rakazo-character-dots");
      if (previous === "thinking" && dots instanceof SVGElement) {
        dots.style.display = "inline";
        const fading = play(dots, [{ opacity: 1 }, { opacity: 0 }], fade);
        const hide = () => dots.style.removeProperty("display");
        if (fading) fading.finished.then(hide, hide);
        else hide();
      }
      if (motion === "thinking") {
        play(root.querySelector(".rakazo-character-dots"), [{ opacity: 0 }, { opacity: 1 }], fade);
        // The leaving figure stays mounted briefly; fade it rather than let it pop.
        play(root.querySelector(".rakazo-character-glyph"), [{ opacity: 1 }, { opacity: 0 }], {
          ...fade,
          duration: GLYPH_FADE_MS - 20,
          fill: "forwards",
        });
      } else {
        play(root.querySelector(".rakazo-character-glyph"), [{ opacity: 0 }, { opacity: 1 }], fade);
      }
    }
    startHeld();
  }, [motion]);
  return ref;
}

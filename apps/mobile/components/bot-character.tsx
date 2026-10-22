import type { BotFace, BotMotion, CharacterPose } from "@rakazo/core";
import {
  BRIDGE_MS,
  BUSY_EYE_TRACKS,
  CHARACTER_TRACKS,
  cubicBezier,
  DOZE_AFTER_MS,
  easeInOut,
  FACE_MORPH_MS,
  FOLD_MS,
  FOLD_ROUND_MS,
  faceForMotion,
  GLYPH_CORE_RADIUS,
  GLYPH_PERIOD_MS,
  GLYPH_SCALE,
  GLYPH_UNIT,
  isFoldedMotion,
  isGlyphMotion,
  MAX_FRAME_MS,
  mixPose,
  orbitDot,
  PENCIL_INK,
  PENCIL_WRITE,
  pencilTip,
  progressFill,
  REST_POSE,
  radarRing,
  sendCoreRadius,
  sendLaunch,
  sendPacket,
  sendTrail,
  THINKING_DOTS,
  thinkingDot,
  trackPose,
  workingAvatarDuration,
  workingAvatarFrame,
} from "@rakazo/core";
import { memo, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import type { EyeNumbers, EyePlacement } from "../lib/bot-character";
import { eyeHole, faceNumbers, mixFaces } from "../lib/bot-character";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

type Frame = {
  body: CharacterPose;
  look: CharacterPose;
  eyes: CharacterPose;
};

/** A state's pose `ms` after it began, layer by layer (the shared desktop keyframes). */
function statePose(motion: string, ms: number, organic: boolean, seed: number): Frame {
  "worklet";
  const tracks = CHARACTER_TRACKS[motion as BotMotion];
  let body = trackPose(tracks?.body, ms);
  let eyes = trackPose(tracks?.eyes, ms);
  if (motion === "busy") {
    eyes = trackPose([BUSY_EYE_TRACKS[seed % 4] ?? BUSY_EYE_TRACKS[0]!], ms);
    if (organic) {
      // Organic blobs keep their own family loop while busy, as on web.
      const duration = workingAvatarDuration(seed);
      const f = workingAvatarFrame(seed, (ms % duration) / duration);
      body = {
        tx: (f.translationX / 120) * 100,
        ty: (f.translationY / 120) * 100,
        rot: f.rotation,
        sx: f.scaleX,
        sy: f.scaleY,
      };
    }
  }
  return { body, look: trackPose(tracks?.look, ms), eyes };
}

type CharacterProps = {
  /** The body outline, in the viewBox `min` .. `min + unit`. */
  path: string;
  fill: string;
  size: number;
  min: number;
  unit: number;
  /** Where the eye pair sits, and the blob's small tilt. */
  eyes: { x: number; y: number; rotate: number };
  motion: BotMotion;
  organic: boolean;
  seed: number;
};

/**
 * The bot as a living character, as on desktop: its state's motion plays from the shared
 * keyframes, faces morph stroke by stroke, the body folds into thinking dots or a figure's core
 * and back, and every other switch blends over Grok's 500ms bridge. One frame clock per avatar
 * runs only while something moves, and never jumps more than two frames after a stall.
 */
export const BotCharacter = memo(function BotCharacter({
  path,
  fill,
  size,
  min,
  unit,
  eyes,
  motion,
  organic,
  seed,
}: CharacterProps) {
  const still = useReducedMotion();
  const [dozing, setDozing] = useState(false);
  useEffect(() => {
    setDozing(false);
    if (motion !== "blocked") return;
    const timer = setTimeout(() => setDozing(true), DOZE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [motion]);
  const face: BotFace = faceForMotion(motion, dozing);
  const place: EyePlacement = useMemo(
    () => ({ x: eyes.x, y: eyes.y, rotate: eyes.rotate, unit }),
    [eyes.x, eyes.y, eyes.rotate, unit],
  );

  // The clock, the state it times, and what each switch blends away from.
  const clock = useSharedValue(0);
  const state = useSharedValue<string>(motion);
  /** The state before the last switch, for cross-fades between folded faces. */
  const previous = useSharedValue<string>(motion);
  const stateAt = useSharedValue(0);
  const switchAt = useSharedValue(-BRIDGE_MS);
  const from = useSharedValue<Frame>({ body: REST_POSE, look: REST_POSE, eyes: REST_POSE });
  const shown = useSharedValue<Frame>({ body: REST_POSE, look: REST_POSE, eyes: REST_POSE });
  const foldAt = useSharedValue(-FOLD_MS * 2);
  const folding = useSharedValue(isFoldedMotion(motion) ? 1 : 0);
  const faceFrom = useSharedValue<EyeNumbers[]>(faceNumbers(face, unit, size));
  const faceTo = useSharedValue<EyeNumbers[]>(faceNumbers(face, unit, size));
  const faceAt = useSharedValue(-FACE_MORPH_MS);
  const lastFrame = useSharedValue(-1);

  const frame = useFrameCallback((info) => {
    "worklet";
    const now = info.timestamp;
    const dt = lastFrame.value < 0 ? 0 : Math.min(now - lastFrame.value, MAX_FRAME_MS);
    lastFrame.value = now;
    clock.value += dt;
    const t = clock.value;
    const pose = statePose(state.value, t - stateAt.value, organic, seed);
    const bridge = easeInOut(Math.min(1, (t - switchAt.value) / BRIDGE_MS));
    shown.value = {
      body: mixPose(from.value.body, pose.body, bridge),
      look: mixPose(from.value.look, pose.look, bridge),
      eyes: mixPose(from.value.eyes, pose.eyes, bridge),
    };
    const settled =
      state.value === "idle" &&
      t - switchAt.value > BRIDGE_MS &&
      t - foldAt.value > FOLD_MS &&
      t - faceAt.value > FACE_MORPH_MS;
    if (settled) {
      lastFrame.value = -1;
      runOnJS(stopClock)();
    }
  }, false);

  function stopClock() {
    frame.setActive(false);
  }

  // A new state: blend from what is on screen now, fold or unfold, and morph the face.
  useEffect(() => {
    if (state.value === motion) return;
    const wasFolded = isFoldedMotion(state.value);
    from.value = shown.value;
    switchAt.value = clock.value;
    stateAt.value = clock.value;
    if (wasFolded !== isFoldedMotion(motion)) {
      folding.value = isFoldedMotion(motion) ? 1 : 0;
      foldAt.value = clock.value;
    }
    previous.value = state.value;
    state.value = motion;
    if (!still) frame.setActive(true);
  }, [motion, still, clock, folding, foldAt, frame, from, shown, state, stateAt, switchAt]);

  useEffect(() => {
    const next = faceNumbers(face, unit, size);
    const t = Math.min(1, (clock.value - faceAt.value) / FACE_MORPH_MS);
    faceFrom.value = mixFaces(faceFrom.value, faceTo.value, easeInOut(t));
    faceTo.value = next;
    faceAt.value = clock.value;
    if (!still) frame.setActive(true);
  }, [face, unit, size, still, clock, faceAt, faceFrom, faceTo, frame]);

  useEffect(() => {
    if (motion !== "idle" && !still) frame.setActive(true);
  }, [motion, still, frame]);

  // The body: its pose, and during a fold it rounds and shrinks under the core.
  const bodyStyle = useAnimatedStyle(() => {
    const body = still ? REST_POSE : shown.value.body;
    const f = clock.value - foldAt.value;
    let scale = 1;
    let opacity = isFoldedMotion(state.value) ? 0 : 1;
    if (!still && f < FOLD_MS) {
      if (folding.value === 1) {
        opacity = f < FOLD_ROUND_MS ? 1 : 0;
        scale = 1 - 0.3 * easeInOut(Math.min(1, f / FOLD_ROUND_MS));
      } else {
        const swell = FOLD_MS - FOLD_ROUND_MS;
        opacity = f < swell ? 0 : 1;
        scale =
          f < swell ? 0.9 : 0.9 + 0.1 * easeInOut(Math.min(1, (f - swell) / (FOLD_ROUND_MS * 2)));
      }
    }
    return {
      opacity,
      transform: [
        { translateX: (body.tx / 100) * size },
        { translateY: (body.ty / 100) * size },
        { rotate: `${body.rot}deg` },
        { scaleX: body.sx * scale },
        { scaleY: body.sy * scale },
      ],
    };
  });

  // The body path with the eyes cut out of it (even-odd), so they show what is behind.
  const bodyProps = useAnimatedProps(() => {
    const t = still ? 1 : Math.min(1, (clock.value - faceAt.value) / FACE_MORPH_MS);
    const eyesNow = mixFaces(faceFrom.value, faceTo.value, easeInOut(t));
    const pose = still ? { body: REST_POSE, look: REST_POSE, eyes: REST_POSE } : shown.value;
    // As the body unfolds, its eyes turn in from the side.
    const f = clock.value - foldAt.value;
    const swell = FOLD_MS - FOLD_ROUND_MS;
    const turn =
      !still && folding.value === 0 && f < swell + FOLD_ROUND_MS * 1.6
        ? 0.4 + 0.6 * easeInOut(Math.max(0, Math.min(1, (f - swell) / (FOLD_ROUND_MS * 1.6))))
        : 1;
    let d = path;
    for (const eye of eyesNow) d += ` ${eyeHole(eye, place, pose.eyes, pose.look, turn)}`;
    return { d };
  });

  // The current figure, kept mounted briefly after its state ends so it fades out.
  const [glyph, setGlyph] = useState<BotMotion | null>(isGlyphMotion(motion) ? motion : null);
  const [glyphFromFolded, setGlyphFromFolded] = useState(false);
  const [lastMotion, setLastMotion] = useState(motion);
  if (motion !== lastMotion) {
    setLastMotion(motion);
    if (isGlyphMotion(motion)) {
      setGlyph(motion);
      setGlyphFromFolded(isFoldedMotion(lastMotion));
    }
  }
  useEffect(() => {
    if (!glyph || glyph === motion) return;
    const timer = setTimeout(() => setGlyph(null), still ? 0 : GLYPH_FADE_MS);
    return () => clearTimeout(timer);
  }, [glyph, motion, still]);

  const center = min + unit / 2;
  const dotR = THINKING_DOTS.radius * unit;
  const bodyRadius = 0.44 * unit;

  // Thinking dots: the middle one is the core the body folds into; the sides bud out of it.
  const dotProps = [0, 1, 2].map((index) =>
    // biome-ignore lint/correctness/useHookAtTopLevel: a fixed three, in the same order every render.
    useAnimatedProps(() => {
      const thinking = state.value === "thinking";
      const f = clock.value - foldAt.value;
      const wave = thinkingDot(index, clock.value - stateAt.value);
      let r = dotR * wave.scale;
      let opacity = thinking ? wave.opacity : 0;
      let cx = center + (index - 1) * THINKING_DOTS.gap * unit;
      let cy = center - wave.lift * unit;
      const into = folding.value === 1 && thinking;
      const outOf = folding.value === 0 && f < FOLD_MS && !isFoldedMotion(state.value);
      if (!still && (into || outOf) && f < FOLD_MS) {
        if (index === 1) {
          // The core: a body-sized circle shrinking into the dot, or swelling into the body.
          const big = bodyRadius * (into ? 0.8 : 1);
          const p = into
            ? easeInOut(Math.max(0, (f - FOLD_ROUND_MS) / (FOLD_MS - FOLD_ROUND_MS)))
            : 1 - Math.min(1, f / (FOLD_MS - FOLD_ROUND_MS));
          r = big + (dotR * (into ? wave.scale : 1) - big) * p;
          opacity = into ? 1 : f < FOLD_MS - FOLD_ROUND_MS + 40 ? 1 : 0;
          cy = center;
        } else {
          const p = into
            ? easeInOut(
                Math.max(0, Math.min(1, (f - FOLD_ROUND_MS - 60) / (FOLD_MS - FOLD_ROUND_MS))),
              )
            : 1 - Math.min(1, f / 150);
          cx = center + (index - 1) * THINKING_DOTS.gap * unit * p;
          r = dotR * (0.25 + 0.75 * p);
          opacity = (into ? wave.opacity : 0.5) * p;
        }
      } else if (!thinking) {
        // Dots leaving for a morph figure fade out around the core instead of vanishing.
        const swap = clock.value - switchAt.value;
        opacity =
          previous.value === "thinking" && isGlyphMotion(state.value) && swap < GLYPH_FADE_MS
            ? wave.opacity * (1 - swap / GLYPH_FADE_MS)
            : 0;
      } else if (isGlyphMotion(previous.value)) {
        // Dots returning from a figure fade in as it fades out.
        opacity *= Math.min(1, (clock.value - switchAt.value) / GLYPH_FADE_MS);
      }
      return { cx, cy, r: Math.max(r, 0.01), opacity: still ? (thinking ? 1 : 0) : opacity };
    }),
  );

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <Svg width={size} height={size} viewBox={`${min} ${min} ${unit} ${unit}`}>
          <AnimatedPath animatedProps={bodyProps} fill={fill} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      <View pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`${min} ${min} ${unit} ${unit}`}>
          <G fill={fill}>
            {dotProps.map((animatedProps, index) => (
              <AnimatedCircle key={index} animatedProps={animatedProps} />
            ))}
          </G>
          {glyph ? (
            <GlyphFigure
              key={glyph}
              motion={glyph}
              leaving={glyph !== motion}
              fromFolded={glyphFromFolded}
              center={center}
              unit={unit}
              fill={fill}
              clock={clock}
              switchAt={switchAt}
              size={size}
            />
          ) : null}
        </Svg>
      </View>
    </View>
  );
});

type SharedNumber = { value: number };

/** A figure fades in or out over this long when it swaps with another folded face. */
const GLYPH_FADE_MS = 220;

/**
 * Grok's morph figures around the core, from the shared frame math: radar (searching), orbit
 * (waiting), send (messaging), progress (creating) and pencil (writing).
 */
function GlyphFigure({
  motion,
  leaving,
  fromFolded,
  center,
  unit,
  fill,
  clock,
  switchAt,
  size,
}: {
  motion: BotMotion;
  /** Its state has ended: it fades out. */
  leaving: boolean;
  /** It replaced the dots or another figure, so it fades in at once instead of after the fold. */
  fromFolded: boolean;
  center: number;
  unit: number;
  fill: string;
  clock: SharedNumber;
  switchAt: SharedNumber;
  size: number;
}) {
  const kind = motion as keyof typeof GLYPH_SCALE;
  const scale = (GLYPH_SCALE[kind] * 0.85 * unit) / GLYPH_UNIT;
  const core = GLYPH_CORE_RADIUS[kind];
  const period = GLYPH_PERIOD_MS[kind];
  const minStroke = (0.75 * unit) / size;
  const slots = kind === "waiting" ? 5 : kind === "searching" ? 3 : kind === "messaging" ? 3 : 0;
  // The figure's loop starts when it mounts, which is when its state begins. The clock is read
  // after render: shared values can't be read while React renders.
  const startedAt = useSharedValue(-1);
  useEffect(() => {
    startedAt.value = clock.value;
  }, [clock, startedAt]);
  const elapsed = useDerivedValue(() => (startedAt.value < 0 ? 0 : clock.value - startedAt.value));
  const fade = useAnimatedProps(() => {
    if (leaving)
      return { opacity: Math.max(0, 1 - (clock.value - switchAt.value) / GLYPH_FADE_MS) };
    const delay = fromFolded ? 0 : FOLD_ROUND_MS + 60;
    return {
      opacity: Math.min(1, Math.max(0, (elapsed.value - delay) / GLYPH_FADE_MS)),
    };
  });
  const coreProps = useAnimatedProps(() => {
    const p = (((elapsed.value / period) % 1) + 1) % 1;
    const r = kind === "messaging" ? sendCoreRadius(p) : core;
    return { r: kind === "writing" ? 0 : r * scale };
  });
  const circles = Array.from({ length: 5 }, (_, i) =>
    // biome-ignore lint/correctness/useHookAtTopLevel: a fixed five, in the same order every render.
    useAnimatedProps(() => {
      if (i >= slots) return { cx: center, cy: center, r: 0, opacity: 0, strokeWidth: 0 };
      const base = elapsed.value / period;
      const at = (offset: number) => (((base + offset) % 1) + 1) % 1;
      const c =
        kind === "searching"
          ? radarRing(core, at(i / 3))
          : kind === "waiting"
            ? orbitDot(at(i / 5))
            : i === 0
              ? sendLaunch(at(0))
              : i === 1
                ? sendTrail(at(0))
                : sendPacket(at(0));
      return {
        cx: center + c.cx * scale,
        cy: center + c.cy * scale,
        r: Math.max(c.r * scale, 0.01),
        opacity: c.opacity,
        strokeWidth: c.stroke === undefined ? 0 : Math.max(c.stroke * scale, minStroke),
      };
    }),
  );
  const ringed = (i: number) => kind === "searching" || (kind === "messaging" && i === 0);
  const radius = 62 * scale;
  const progressProps = useAnimatedProps(() => {
    const p = (((elapsed.value / period) % 1) + 1) % 1;
    const circumference = 2 * Math.PI * radius;
    return { strokeDasharray: [circumference * progressFill(p), circumference] };
  });
  // The ink, as desktop: drawn in behind the point while it writes, then wiped from the start.
  const ink = PENCIL_INK.map(([x, y]) => [center + x * scale, center + y * scale] as const);
  const inkLength = ink.slice(1).reduce((sum, [x, y], i) => {
    const [px, py] = ink[i] ?? [x, y];
    return sum + Math.hypot(x - px, y - py);
  }, 0);
  const inkProps = useAnimatedProps(() => {
    const p = (((elapsed.value / period) % 1) + 1) % 1;
    const lift = PENCIL_WRITE + 0.02;
    const shown =
      p < PENCIL_WRITE
        ? 1 - cubicBezier(0.42, 0, 0.58, 1, p / PENCIL_WRITE)
        : p < lift
          ? 0
          : p < 0.9
            ? -cubicBezier(0.42, 0, 0.58, 1, (p - lift) / (0.9 - lift))
            : -1;
    return { strokeDashoffset: shown * inkLength };
  });
  const pencilProps = useAnimatedProps(() => {
    const p = (((elapsed.value / period) % 1) + 1) % 1;
    const tip = pencilTip(p);
    return {
      transform: [
        { translateX: center + tip.x * scale },
        { translateY: center + tip.y * scale },
        { rotate: `${tip.rot}deg` },
      ],
    };
  });
  return (
    <AnimatedG animatedProps={fade} fill={fill}>
      <AnimatedCircle cx={center} cy={center} animatedProps={coreProps} />
      {circles.map((animatedProps, i) => (
        <AnimatedCircle
          key={i}
          animatedProps={animatedProps}
          fill={ringed(i) ? "none" : fill}
          stroke={ringed(i) ? fill : undefined}
        />
      ))}
      {kind === "creating" ? (
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={fill}
            strokeWidth={Math.max(5 * scale, minStroke)}
            opacity={0.16}
          />
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={fill}
            strokeWidth={Math.max(5 * scale, minStroke)}
            animatedProps={progressProps}
          />
        </G>
      ) : null}
      {kind === "writing" ? (
        <AnimatedPath
          d={ink.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")}
          fill="none"
          stroke={fill}
          strokeWidth={Math.max(6 * scale, minStroke)}
          strokeLinecap="round"
          strokeDasharray={[inkLength, inkLength]}
          animatedProps={inkProps}
        />
      ) : null}
      {kind === "writing" ? (
        <AnimatedG animatedProps={pencilProps}>
          <Circle r={17 * scale} />
          <Rect
            x={-9 * scale}
            y={-96 * scale}
            width={18 * scale}
            height={78 * scale}
            rx={5 * scale}
          />
          <Path
            d={`M ${-9 * scale} ${-18 * scale} L 0 ${-2 * scale} L ${9 * scale} ${-18 * scale} Z`}
          />
        </AnimatedG>
      ) : null}
    </AnimatedG>
  );
}

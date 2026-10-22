/**
 * The bot character shared by web (CSS + Web Animations in `@rakazo/ui-web`) and mobile
 * (Reanimated worklets): its states, eye geometry, the keyframes of every state's motion, the
 * thinking-dot wave and the morph-figure math. Functions are worklets so Reanimated can run them
 * on the UI thread. Web's `styles.css` keyframes mirror `CHARACTER_TRACKS` (see the sync test).
 */

/**
 * What a bot's face is doing: resting, thinking (its body folds into three dots), busy with a
 * tool (looking around), typing a reply, one of Grok's morph figures (searching, writing,
 * creating, messaging, waiting), blocked on the user, done or failed for a moment after a run,
 * Grok's idle loop (the open chat's avatar, and a quiet call), or listening and speaking in a call.
 */
export type BotMotion =
  | "idle"
  | "thinking"
  | "busy"
  | "typing"
  | "searching"
  | "writing"
  | "creating"
  | "messaging"
  | "waiting"
  | "blocked"
  | "done"
  | "failed"
  | "listening"
  | "speaking"
  | "idle-loop";

/** What the bot is doing during a voice call, as Grok's call bar shows it. */
export type CallAvatarState = "listening" | "thinking" | "speaking" | "idle";

/** Grok's call faces: the caller speaking, the bot thinking, the bot speaking, and quiet. */
export const CALL_MOTIONS: Record<CallAvatarState, BotMotion> = {
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  idle: "idle-loop",
};

/** How long a bot keeps its happy or sad face after a run settles, as in Grok. */
export const SETTLED_MS = 8000;

/** Grok's blocked face turns drowsy after two minutes. */
export const DOZE_AFTER_MS = 120_000;

/** The morph figures: the body folds into a small core and a figure plays around it. */
export type GlyphMotion = "searching" | "writing" | "creating" | "messaging" | "waiting";

export function isGlyphMotion(motion: string): motion is GlyphMotion {
  "worklet";
  return (
    motion === "searching" ||
    motion === "writing" ||
    motion === "creating" ||
    motion === "messaging" ||
    motion === "waiting"
  );
}

/** States whose body folds away: the thinking dots and every morph figure. */
export function isFoldedMotion(motion: string | undefined): boolean {
  "worklet";
  return motion === "thinking" || (motion !== undefined && isGlyphMotion(motion));
}

/** Faces the eyes can make; every one is two quadratic strokes, so any face morphs into any other. */
export type BotFace = "open" | "forward" | "happy" | "sad" | "confused" | "sleepy" | "calm";

/** The face each state makes; anything else keeps its eyes open. Blocked dozes into sleepy. */
export function faceForMotion(motion: string | undefined, dozing = false): BotFace {
  "worklet";
  switch (motion) {
    case "done":
      return "happy";
    case "failed":
      return "sad";
    case "blocked":
      return dozing ? "sleepy" : "confused";
    case "listening":
      return "calm";
    case "speaking":
    case "idle-loop":
      return "forward";
    default:
      return "open";
  }
}

/**
 * Grok Bot's eyes as fractions of the avatar box (measured at 16, 24, 40 and 72px): two
 * stadiums tilted 28deg left, the pair rising 15deg to the right, set up and right of center.
 * Their length also has a fixed `lengthPx`, so small avatars keep readable eyes.
 */
export const BOT_EYES = {
  length: 0.19,
  lengthPx: 0.75,
  width: 0.085,
  gap: 0.18,
  rise: 15,
  tilt: -28,
  x: 0.11,
  y: -0.12,
} as const;

/** Pointed studio shapes are too narrow up top, so their eyes sit lower. */
export const SHAPE_EYE_ORIGINS: Partial<Record<string, { x: number; y: number }>> = {
  wedge: { x: 0.03, y: -0.04 },
  teardrop: { x: 0.11, y: -0.06 },
};

/** The studio shapes' viewBox, as a square from `min`, `unit` wide. */
export const SHAPE_FRAME = { min: -15, unit: 259 } as const;
/** The organic blob's viewBox. */
export const ORGANIC_FRAME = { min: -60, unit: 120 } as const;

const round2 = (value: number) => {
  "worklet";
  return Math.round(value * 100) / 100;
};
const DEG = Math.PI / 180;

/** Where the eye pair sits (its center) in a square viewBox starting at `min`, `unit` wide. */
export function eyeOrigin(min: number, unit: number, shape?: string): { x: number; y: number } {
  const at = (shape && SHAPE_EYE_ORIGINS[shape]) || BOT_EYES;
  const center = min + unit / 2;
  return { x: round2(center + at.x * unit), y: round2(center + at.y * unit) };
}

/** Centers of the left and right eye around (0, 0), `unit` viewBox units wide. */
export function eyeCenters(unit: number): { side: number; cx: number; cy: number }[] {
  "worklet";
  const rise = (BOT_EYES.rise * Math.PI) / 180;
  return [-1, 1].map((side) => ({
    side,
    cx: round2((side * BOT_EYES.gap * unit * Math.cos(rise)) / 2),
    cy: round2((-side * BOT_EYES.gap * unit * Math.sin(rise)) / 2),
  }));
}

/** One eye as a quadratic stroke from (x0, y0) through control (x1, y1) to (x2, y2), `width` thick. */
export type EyeQuad = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
};

/**
 * Each eye of a face, centered on (0, 0) for a `size`px box `unit` viewBox units wide.
 * Open: Grok's stadium, a straight stroke tilted 28deg with round caps. Forward (in a call and
 * the idle loop): upright, level and nearly centered. Happy (done): an upturned arc. Sad
 * (failed): shorter, sloping down to the outside, lower. Confused (blocked): a "<". Sleepy
 * (dozing): a shallow closed curve. Calm (listening in a call): a short level capsule.
 */
export function eyeQuads(face: BotFace, unit: number, size: number): EyeQuad[] {
  "worklet";
  const w = BOT_EYES.width * unit;
  const length = (BOT_EYES.length + BOT_EYES.lengthPx / size) * unit;
  // Measured in the call recording: the pair sits 7% left of the usual spot and 2% lower.
  const forward = face === "forward" || face === "calm";
  return eyeCenters(unit).map(({ side, cx: x, cy: y }) => {
    const cx = forward ? (side * BOT_EYES.gap * unit) / 2 - 0.07 * unit : x;
    const cy = forward ? 0.02 * unit : y;
    const quad = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width: number,
    ): EyeQuad => ({ x0, y0, x1, y1, x2, y2, width });
    switch (face) {
      case "happy": {
        const half = length * 0.3;
        const hx = cx * 1.25;
        const hy = cy * 1.25;
        return quad(
          hx - half,
          hy + half * 0.4,
          hx,
          hy - half,
          hx + half,
          hy + half * 0.4,
          w * 0.75,
        );
      }
      case "sad": {
        const half = (length * 0.7 - w) / 2;
        const tilt = -side * BOT_EYES.tilt * DEG;
        const sy = cy + 0.03 * unit;
        const dx = half * Math.sin(tilt);
        const dy = half * Math.cos(tilt);
        return quad(cx + dx, sy - dy, cx, sy, cx - dx, sy + dy, w);
      }
      case "confused": {
        const half = length * 0.45;
        const qx = cx - half * 0.3;
        return quad(
          qx + half * 0.3,
          cy - half,
          qx - half * 1.3,
          cy,
          qx + half * 0.3,
          cy + half,
          w * 0.75,
        );
      }
      case "sleepy": {
        const half = length * 0.4;
        return quad(cx - half, cy, cx, cy + half * 0.45, cx + half, cy, w * 0.6);
      }
      case "calm": {
        const half = length * 0.18;
        return quad(cx - half, cy, cx, cy + half * 0.15, cx + half, cy, w * 0.8);
      }
      default: {
        // The original eye: a stadium round(width) x round(length), rotated by the tilt about its
        // center; drawn as its centerline with round caps, so it is the same shape.
        const stadiumW = round2(w);
        const half = (round2(length) - stadiumW) / 2;
        const tilt = face === "forward" ? 0 : BOT_EYES.tilt * DEG;
        const dx = half * Math.sin(tilt);
        const dy = half * Math.cos(tilt);
        return quad(cx + dx, cy - dy, cx, cy, cx - dx, cy + dy, stadiumW);
      }
    }
  });
}

/** `M from Q control to` with rounded numbers, the SVG path of an eye quad. */
export function eyeQuadPath(q: EyeQuad): string {
  "worklet";
  return `M ${round2(q.x0)} ${round2(q.y0)} Q ${round2(q.x1)} ${round2(q.y1)} ${round2(q.x2)} ${round2(q.y2)}`;
}

/** The original resting eyes as rects (x, y, width, height, rx) tilted about their centers. */
export function restingEyeRects(
  unit: number,
  size: number,
): { x: number; y: number; width: number; height: number; rx: number; cx: number; cy: number }[] {
  const w = round2(BOT_EYES.width * unit);
  const h = round2((BOT_EYES.length + BOT_EYES.lengthPx / size) * unit);
  return eyeCenters(unit).map(({ cx, cy }) => ({
    x: round2(cx - w / 2),
    y: round2(cy - h / 2),
    width: w,
    height: h,
    rx: round2(w / 2),
    cx,
    cy,
  }));
}

/** A face morph blends the eye strokes over this long (Grok's arc-to-eye morph is ~3 frames). */
export const FACE_MORPH_MS = 180;
/** Other switches blend the outgoing pose away over 500ms, Grok's clip bridge. */
export const BRIDGE_MS = 500;
/** Folding the body into a core: it rounds first, then shrinks (measured on Grok at 30fps). */
export const FOLD_ROUND_MS = 100;
export const FOLD_MS = 330;
/** A frame never advances an animation by more than two 60fps frames, even after a stall. */
export const MAX_FRAME_MS = 33;

export function easeInOut(t: number): number {
  "worklet";
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** CSS cubic-bezier timing, solved for x with a few Newton steps. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const fx = ((ax * t + bx) * t + cx) * t - x;
    const dx = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(fx) < 1e-5 || dx === 0) break;
    t -= fx / dx;
  }
  return ((ay * t + by) * t + cy) * t;
}

/** A transform: translate in % of the avatar box, rotate in degrees, scale. */
export type CharacterPose = { tx: number; ty: number; rot: number; sx: number; sy: number };

export const REST_POSE: CharacterPose = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };

type Keyframe = [offset: number, pose: Partial<CharacterPose>];

/** One CSS-style animation: keyframes, duration, per-segment easing, iterations and fill. */
export type CharacterTrack = {
  frames: Keyframe[];
  duration: number;
  easing: [number, number, number, number];
  iterations: number;
  delay?: number;
  fillForwards?: boolean;
};

const IN_OUT: [number, number, number, number] = [0.42, 0, 0.58, 1];
const SETTLE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const LINEAR: [number, number, number, number] = [0, 0, 1, 1];
const loop = (
  duration: number,
  frames: Keyframe[],
  easing = IN_OUT,
  delay = 0,
): CharacterTrack => ({ frames, duration, easing, iterations: Number.POSITIVE_INFINITY, delay });

/**
 * Every state's motion, layer by layer: `body` moves the whole figure, `look` the eye pair
 * (Grok's gaze), `eyes` squashes and shifts the eyes (blinks). Mirrors web `styles.css`.
 */
export const CHARACTER_TRACKS: Partial<
  Record<BotMotion, { body?: CharacterTrack[]; look?: CharacterTrack[]; eyes?: CharacterTrack[] }>
> = {
  busy: {
    body: [
      loop(2400, [
        [0, { rot: -5, sx: 0.97, sy: 1.02 }],
        [0.3, { rot: 6, tx: 2, sx: 1.03, sy: 0.97 }],
        [0.55, { rot: 1, ty: -3, sx: 0.98, sy: 1.03 }],
        [0.8, { rot: -4, tx: -2, sx: 1.02, sy: 0.98 }],
        [1, { rot: -5, sx: 0.97, sy: 1.02 }],
      ]),
    ],
  },
  typing: {
    body: [
      loop(2600, [
        [0, { tx: 0.35, ty: -2.7, rot: 15.4 }],
        [0.133, { tx: 0.3, ty: 1.5, rot: -1.3 }],
        [0.224, { tx: -0.4, ty: -2.4, rot: -2.2 }],
        [0.322, { tx: 0.1, ty: 0.7, rot: -3.7 }],
        [0.47, {}],
        [0.624, { tx: 2.2, ty: -0.85, rot: 3.1 }],
        [0.794, { tx: -1.7, ty: -0.3, rot: -20 }],
        [1, { tx: 0.35, ty: -2.7, rot: 15.4 }],
      ]),
    ],
    eyes: [
      loop(2600, [
        [0, { tx: 0.5, ty: -4.6 }],
        [0.133, { tx: 0.5, ty: 2.5 }],
        [0.224, { tx: -0.6, ty: -4 }],
        [0.322, { tx: 0.1, ty: 1.1 }],
        [0.47, {}],
        [0.624, { tx: 3.4, ty: -1.4 }],
        [0.794, { tx: -2.5, ty: -0.55 }],
        [1, { tx: 0.5, ty: -4.6 }],
      ]),
    ],
  },
  "idle-loop": {
    body: [
      loop(4000, [
        [0, {}],
        [0.225, {}],
        [0.405, { tx: -1.3, rot: -2.5, sx: 1.067, sy: 1.067 }],
        [0.623, { tx: 0.9, rot: 1.7, sx: 1.04, sy: 1.04 }],
        [0.865, { sx: 1.01, sy: 1.01 }],
        [1, {}],
      ]),
    ],
    look: [
      loop(4000, [
        [0, {}],
        [0.1, { tx: 4.3, ty: 0.5 }],
        [0.2, { tx: 4.3, ty: 0.5 }],
        [0.3, { tx: -5.2 }],
        [0.33, { tx: -5.5, ty: -5.8 }],
        [0.4, { tx: -5.5, ty: -5.8 }],
        [0.43, { tx: -1, ty: 1 }],
        [0.46, { tx: -6 }],
        [0.65, { tx: -6 }],
        [0.68, { ty: 1.5 }],
        [0.77, { ty: 1.5 }],
        [0.8, { tx: -4, ty: -3.5 }],
        [0.85, { tx: -4, ty: -3.5 }],
        [0.88, { tx: -4.8, ty: 0.5 }],
        [0.97, { tx: -4.8, ty: 0.5 }],
        [1, {}],
      ]),
    ],
    eyes: [
      loop(
        2000,
        [
          [0, {}],
          [0.045, {}],
          [0.06, { sy: 0.45 }],
          [0.075, { sy: 0.1 }],
          [0.105, { sy: 0.1 }],
          [0.12, { sy: 0.45 }],
          [0.135, {}],
          [1, {}],
        ],
        LINEAR,
      ),
    ],
  },
  blocked: {
    body: [
      {
        frames: [
          [0, {}],
          [0.184, { tx: 5, ty: -0.5, rot: 6.1 }],
          [0.354, { tx: -8.7, ty: -1.9, rot: -8.1 }],
          [0.41, { tx: 2.2, ty: -0.9, rot: 7.5 }],
          [0.495, { tx: -7.4, ty: -0.7, rot: -8.5 }],
          [0.613, { tx: 2.2, ty: -0.9, rot: 7.5 }],
          [0.83, {}],
          [1, {}],
        ],
        duration: 2120,
        easing: IN_OUT,
        iterations: 57,
      },
      loop(
        1400,
        [
          [0, { tx: -7.4, ty: 3.5, rot: -4.7 }],
          [0.49, { tx: 5.2, ty: 3.5, rot: 0.7 }],
          [1, { tx: -7.4, ty: 3.5, rot: -4.7 }],
        ],
        IN_OUT,
      ),
    ],
  },
  failed: {
    body: [
      {
        frames: [
          [0, {}],
          [1, { ty: 22, sx: 1.02, sy: 0.94, rot: -1.3 }],
        ],
        duration: 1260,
        easing: IN_OUT,
        iterations: 1,
        fillForwards: true,
      },
    ],
  },
  done: {
    body: [
      {
        frames: [
          [0, { sx: 1.06, sy: 0.92 }],
          [0.45, { ty: -6, sx: 0.97, sy: 1.04 }],
          [1, {}],
        ],
        duration: 600,
        easing: SETTLE,
        iterations: 1,
      },
    ],
  },
  listening: {
    body: [
      loop(6000, [
        [0, { tx: 5.1, ty: -2.5, rot: 25.4 }],
        [0.105, { tx: 2.6, ty: -5.4, rot: 15.1 }],
        [0.192, { tx: 2.6, ty: -5.4, rot: 15.1 }],
        [0.348, { tx: 0.5, ty: -1, rot: 14.4 }],
        [0.474, { tx: 0.5, ty: -1, rot: 14.4 }],
        [0.694, { tx: 6.2, ty: 1.2, rot: 25.5 }],
        [0.85, { tx: 6.2, ty: 1.2, rot: 25.5 }],
        [0.94, { tx: 5.1, ty: -2.5, rot: 25.4 }],
        [1, { tx: 5.1, ty: -2.5, rot: 25.4 }],
      ]),
    ],
    look: [
      loop(6000, [
        [0, { tx: 7.7, ty: -4.2 }],
        [0.105, { tx: 3.9, ty: -9 }],
        [0.192, { tx: 3.9, ty: -9 }],
        [0.348, { tx: 0.7, ty: -1.6 }],
        [0.474, { tx: 0.7, ty: -1.6 }],
        [0.694, { tx: 9.3, ty: 2 }],
        [0.85, { tx: 9.3, ty: 2 }],
        [0.94, { tx: 7.7, ty: -4.2 }],
        [1, { tx: 7.7, ty: -4.2 }],
      ]),
    ],
  },
};
CHARACTER_TRACKS.speaking = CHARACTER_TRACKS.typing;

/** Busy eyes look around: four patterns by identity, each with its own length and offset. */
export const BUSY_EYE_TRACKS: CharacterTrack[] = [
  loop(6600, [
    [0, { tx: -9, ty: 1, sy: 0.94 }],
    [0.18, { tx: 9, ty: -2, sy: 1.04 }],
    [0.34, { ty: -8, sx: 1.08, sy: 1.08 }],
    [0.48, { sx: 1.12, sy: 0.82 }],
    [0.51, { sx: 1.05, sy: 0.08 }],
    [0.54, { sx: 1.12, sy: 0.9 }],
    [0.72, { tx: -5, ty: 7, sy: 0.9 }],
    [0.86, { tx: 7, ty: 3 }],
    [1, { tx: -9, ty: 1, sy: 0.94 }],
  ]),
  loop(
    7200,
    [
      [0, { ty: -8, sx: 1.06, sy: 1.06 }],
      [0.16, { tx: 8, ty: 2 }],
      [0.31, { ty: 8, sy: 0.9 }],
      [0.46, { tx: -8, ty: 2 }],
      [0.61, { sx: 0.88, sy: 1.1 }],
      [0.76, { ty: -7, sy: 1.08 }],
      [0.88, { ty: 6, sx: 1.08, sy: 0.86 }],
      [1, { ty: -8, sx: 1.06, sy: 1.06 }],
    ],
    IN_OUT,
    -1400,
  ),
  loop(
    6100,
    [
      [0, { sx: 0.9, sy: 1.08 }],
      [0.2, { sx: 1.14, sy: 0.84 }],
      [0.24, { sx: 1.08, sy: 0.08 }],
      [0.28, { sx: 1.02, sy: 1.02 }],
      [0.45, { tx: -9, ty: -3, sy: 0.94 }],
      [0.62, { tx: 9, ty: 2, sy: 1.05 }],
      [0.8, { ty: -8, sx: 1.06, sy: 1.06 }],
      [1, { sx: 0.9, sy: 1.08 }],
    ],
    IN_OUT,
    -3200,
  ),
  loop(
    7800,
    [
      [0, { ty: 7, sy: 0.9 }],
      [0.14, { ty: -9, sy: 1.08 }],
      [0.3, { tx: 8, ty: -2 }],
      [0.47, { tx: -8, ty: 3, sy: 0.94 }],
      [0.63, { sx: 1.12, sy: 0.82 }],
      [0.78, { ty: -7, sx: 0.9, sy: 1.08 }],
      [0.91, { ty: 5, sx: 1.06, sy: 0.9 }],
      [1, { ty: 7, sy: 0.9 }],
    ],
    IN_OUT,
    -2100,
  ),
];

function poseAt(frames: Keyframe[], easing: CharacterTrack["easing"], p: number): CharacterPose {
  "worklet";
  let i = 0;
  while (i < frames.length - 2 && (frames[i + 1]?.[0] ?? 1) <= p) i++;
  const [o0, a] = frames[i] ?? [0, {}];
  const [o1, b] = frames[i + 1] ?? [1, {}];
  const span = o1 - o0;
  const local = span > 0 ? Math.min(1, Math.max(0, (p - o0) / span)) : 1;
  const e = cubicBezier(easing[0], easing[1], easing[2], easing[3], local);
  const mix = (from: number | undefined, to: number | undefined, rest: number) =>
    (from ?? rest) + ((to ?? rest) - (from ?? rest)) * e;
  return {
    tx: mix(a.tx, b.tx, 0),
    ty: mix(a.ty, b.ty, 0),
    rot: mix(a.rot, b.rot, 0),
    sx: mix(a.sx, b.sx, 1),
    sy: mix(a.sy, b.sy, 1),
  };
}

/** A layer's pose `ms` after its state began, playing its tracks one after another. */
export function trackPose(tracks: CharacterTrack[] | undefined, ms: number): CharacterPose {
  "worklet";
  if (!tracks || tracks.length === 0) return REST_POSE;
  let t = ms;
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track) break;
    const local = t - (track.delay ?? 0);
    const total = track.duration * track.iterations;
    const last = i === tracks.length - 1;
    if (local < total || last) {
      if (local >= total) {
        return track.fillForwards ? poseAt(track.frames, track.easing, 1) : REST_POSE;
      }
      const cycle = ((local % track.duration) + track.duration) % track.duration;
      return poseAt(track.frames, track.easing, cycle / track.duration);
    }
    t -= total;
  }
  return REST_POSE;
}

/** Blend two poses: `t` 0 is `a`, 1 is `b`. */
export function mixPose(a: CharacterPose, b: CharacterPose, t: number): CharacterPose {
  "worklet";
  return {
    tx: a.tx + (b.tx - a.tx) * t,
    ty: a.ty + (b.ty - a.ty) * t,
    rot: a.rot + (b.rot - a.rot) * t,
    sx: a.sx + (b.sx - a.sx) * t,
    sy: a.sy + (b.sy - a.sy) * t,
  };
}

/** Grok's thinking face: three dots on the center line, as fractions of the avatar box. */
export const THINKING_DOTS = { gap: 0.33, radius: 0.12, period: 1400 } as const;

/**
 * One thinking dot `ms` into the wave: a highlight travels left to right every 1.4s; the lit dot
 * rises 4% of the avatar, grows to 1.06 and reaches full opacity (a narrow gaussian).
 */
export function thinkingDot(
  index: number,
  ms: number,
): { opacity: number; scale: number; lift: number } {
  "worklet";
  const offsets = [0.5, 0.1667, 0.8333];
  const p = (((ms / THINKING_DOTS.period + (offsets[index] ?? 0)) % 1) + 1) % 1;
  const d = Math.abs(p - 0.5);
  const g = Math.exp(-(d * d) / 0.045);
  return { opacity: 0.5 + 0.5 * g, scale: 0.84 + 0.22 * g, lift: 0.04 * g };
}

/** Morph figures are drawn in Grok's 229-unit canvas, scaled per figure. */
export const GLYPH_UNIT = 229;
export const GLYPH_SCALE: Record<GlyphMotion, number> = {
  searching: 1.14,
  writing: 1.18,
  creating: 1.32,
  messaging: 1.12,
  waiting: 1.14,
};
/** Radius of the core the body folds into, in Grok units. */
export const GLYPH_CORE_RADIUS: Record<GlyphMotion, number> = {
  searching: 19,
  writing: 17,
  creating: 19,
  messaging: 20,
  waiting: 19,
};
export const GLYPH_PERIOD_MS: Record<GlyphMotion, number> = {
  searching: 1300,
  writing: 2500,
  creating: 2500,
  messaging: 1500,
  waiting: 3700,
};

const clamp01 = (value: number) => {
  "worklet";
  return Math.min(1, Math.max(0, value));
};
const easeOutCubic = (t: number) => {
  "worklet";
  return 1 - (1 - t) ** 3;
};
const smoothstep = (t: number) => {
  "worklet";
  return t * t * (3 - 2 * t);
};

/** A circle of a figure, in Grok units around the center. */
export type GlyphCircle = { cx: number; cy: number; r: number; opacity: number; stroke?: number };

/** Radar: three rings swell out of the core every 1.3s, thinning and fading. */
export function radarRing(core: number, p: number): GlyphCircle {
  "worklet";
  return {
    cx: 0,
    cy: 0,
    r: core + (104 - core) * p,
    stroke: 3.4 * (1 - p * 0.55),
    opacity: 0.9 * (1 - p),
  };
}

/** Orbit: five dots circle the core on a tilted ellipse every 3.7s, bigger in front. */
export function orbitDot(p: number): GlyphCircle {
  "worklet";
  const angle = p * Math.PI * 2;
  const depth = Math.cos(angle);
  return {
    cx: 52 * Math.sin(angle),
    cy: -52 * 0.42 * depth,
    r: Math.max(12 * (0.5 + 0.5 * clamp01(depth)), 0.3),
    opacity: Math.min(1, Math.max(0.18, (depth + 0.4) / 0.6)),
  };
}

const SEND_DIRECTION = [0.74, -0.62] as const;

/** Send: a packet flies up and right every 1.5s as a ring launches from the core. */
export function sendPacket(p: number): GlyphCircle {
  "worklet";
  const i = clamp01((p - 0.18) / 0.55);
  const a = i * i * (0.4 + 0.6 * i);
  return {
    cx: SEND_DIRECTION[0] * 108 * a,
    cy: SEND_DIRECTION[1] * 108 * a,
    r: 10 * (1 - a * 0.55),
    opacity: i > 0 && i < 1 ? 1 - a * a : 0,
  };
}

/** The packet's fading trail. */
export function sendTrail(p: number): GlyphCircle {
  "worklet";
  const i = clamp01((p - 0.18) / 0.55);
  const l = clamp01((p - 0.26) / 0.55);
  const u = l * l * (0.4 + 0.6 * l);
  return {
    cx: SEND_DIRECTION[0] * 108 * u,
    cy: SEND_DIRECTION[1] * 108 * u,
    r: 5 * (1 - u * 0.6),
    opacity: i > 0 && l > 0 && l < 1 ? 0.3 * (1 - u) : 0,
  };
}

/** The launch ring around the core. */
export function sendLaunch(p: number): GlyphCircle {
  "worklet";
  const d = clamp01((p - 0.18) / 0.3);
  return {
    cx: 0,
    cy: 0,
    r: 20 + 34 * easeOutCubic(d),
    stroke: 2.8 * (1 - d),
    opacity: d > 0 && d < 1 ? 0.8 * (1 - d) : 0,
  };
}

/** The core squashes as it launches. */
export function sendCoreRadius(p: number): number {
  "worklet";
  const squash =
    p < 0.18
      ? -0.06 * Math.sin((p / 0.18) * Math.PI)
      : p < 0.42
        ? 0.05 * Math.sin(((p - 0.18) / 0.24) * Math.PI)
        : 0;
  return 20 * (1 + squash);
}

/** Pencil, 2.5s: the tip writes a wavy line for 68% of the loop, then lifts and returns. */
export const PENCIL_WRITE = 0.68;
export function pencilTip(p: number): { x: number; y: number; rot: number } {
  "worklet";
  if (p < PENCIL_WRITE) {
    const n = p / PENCIL_WRITE;
    const fade = clamp01(n / 0.08) * clamp01((1 - n) / 0.08);
    return { x: -54 + 118 * smoothstep(n), y: 26 + Math.sin(n * 24) * 3.2 * fade, rot: 17 };
  }
  const n = easeOutCubic((p - PENCIL_WRITE) / (1 - PENCIL_WRITE));
  return {
    x: 64 - 118 * n,
    y: 26 - 20 * Math.sin(n * Math.PI),
    rot: 17 - 2 * Math.sin(n * Math.PI),
  };
}

/** The wavy line the pencil's point leaves while writing: 40 points along the stroke. */
export const PENCIL_INK: readonly (readonly [number, number])[] = Array.from(
  { length: 40 },
  (_, step) => {
    const tip = pencilTip((step / 39) * PENCIL_WRITE * 0.999);
    return [tip.x, tip.y + 19] as const;
  },
);

/** Progress: the arc fills from 12 o'clock over 85% of each 2.5s shot. */
export function progressFill(p: number): number {
  "worklet";
  return clamp01(p / 0.85);
}

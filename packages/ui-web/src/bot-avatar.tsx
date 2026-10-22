import type { BotColorDef, BotFace } from "@rakazo/core";
import {
  ACTIVE_RUN_STATUSES,
  avatarIdentitySeed,
  BOT_AVATAR_COLORS,
  BOT_COLOR_LIST,
  BOT_EYES,
  DEFAULT_BOT_AVATAR_COLOR,
  eyeOrigin as eyeOriginPoint,
  eyeQuadPath,
  eyeQuads,
  organicAvatarPath,
  resolvePersonaColorDef,
  restingEyeRects,
  SHIPPED_BOT_AVATAR_CENTER,
  SHIPPED_BOT_AVATAR_SHAPE_KEYS,
  SHIPPED_BOT_AVATAR_SHAPES,
  SHIPPED_BOT_AVATAR_VIEWBOX,
  shippedBotAvatarShapePath,
  shippedHash,
  WAITING_ON_USER_RUN_STATUSES,
} from "@rakazo/core";
import type { CSSProperties, ReactNode } from "react";
import { memo, useId, useMemo } from "react";
import type { AvatarStyle } from "./avatar-style.js";
import { useAvatarStyle } from "./avatar-style.js";
import { GlyphLayer, useBotFace, useMotionBridge } from "./bot-glyphs.js";
import type { BotMotion, CallAvatarState } from "./bot-motion.js";
import { CALL_MOTIONS, useLiveBotMotion } from "./bot-motion.js";
import { cn } from "./lib/utils.js";
import "./styles.css";

export type { BotColorDef };
export { BOT_AVATAR_COLORS, BOT_COLOR_LIST, DEFAULT_BOT_AVATAR_COLOR, resolvePersonaColorDef };

export const BOT_SHAPES = SHIPPED_BOT_AVATAR_SHAPES;
export const SHIPPED_SHAPE_KEYS = SHIPPED_BOT_AVATAR_SHAPE_KEYS;
const VIEWBOX = SHIPPED_BOT_AVATAR_VIEWBOX;
const CENTER = SHIPPED_BOT_AVATAR_CENTER;

export const BOT_MASCOT_SHAPES = SHIPPED_SHAPE_KEYS.map(
  (k) => BOT_SHAPES[k] ?? FALLBACK_SHAPE_PATH,
);

const FALLBACK_SHAPE_PATH = BOT_SHAPES.hex ?? "";

export function resolvePersonaShape(identity: string, explicitShape?: string | null): string {
  if (explicitShape) {
    const explicit = BOT_SHAPES[explicitShape];
    if (explicit) return explicit;
  }
  let hash = shippedHash(identity);
  hash = Math.imul(hash ^ (hash >>> 16), 73244475);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  const shapeIndex = ((hash ^ (hash >>> 16)) >>> 0) % SHIPPED_SHAPE_KEYS.length;
  const key = SHIPPED_SHAPE_KEYS[shapeIndex] ?? "hex";
  return BOT_SHAPES[key] ?? FALLBACK_SHAPE_PATH;
}

export function parseBotAvatar(
  rawColor: string,
  _identity?: string,
): {
  color: string;
  shapeIndex?: number;
  isImage: boolean;
  imageUrl?: string;
} {
  if (!rawColor) return { color: "#F97316", isImage: false };
  // Only data: image URLs are rendered. Arbitrary http(s)/blob values in `color`
  // must not become <img src> (SSRF / tracking when other members view the bot).
  if (rawColor.startsWith("data:image/")) {
    return { color: "#F97316", isImage: true, imageUrl: rawColor };
  }
  if (rawColor.includes("::shape_")) {
    const parts = rawColor.split("::shape_");
    const rawShapeIdx = parts[1] ?? "0";
    const parsedShapeIdx = /^\d+$/.test(rawShapeIdx) ? Number(rawShapeIdx) : 0;
    const shapeIdx = Number.isSafeInteger(parsedShapeIdx) ? parsedShapeIdx : 0;
    return {
      color: parts[0] || "#F97316",
      shapeIndex: shapeIdx % SHIPPED_SHAPE_KEYS.length,
      isImage: false,
    };
  }
  return { color: rawColor, isImage: false };
}

const AVATAR_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function defaultBotAvatarValue(rawColor: string): string {
  const parsed = parseBotAvatar(rawColor);
  if (rawColor && !parsed.isImage && AVATAR_HEX.test(parsed.color)) return parsed.color;
  return DEFAULT_BOT_AVATAR_COLOR;
}

export interface BotAvatarProps {
  color: string;
  size?: number;
  status?: string;
  identity?: string;
  className?: string;
  variant?: AvatarStyle;
  /**
   * Shows the bot's live working faces (from the motion provider, else `status`). Grok animates
   * only roster rows, pinned tiles and the chat's status line; every other avatar stays still.
   */
  animated?: boolean;
  /** Overrides the live motion and the working fallback. */
  motion?: BotMotion;
  /** At rest, plays Grok's idle loop (glances and a blink every 2s), as Grok's open chat does. */
  lively?: boolean;
  /** The in-call face, set by the call UI; it wins over everything else. */
  call?: CallAvatarState;
}

/** Grok's white and grey swatches follow the theme: white draws black in light mode. */
const THEMED_FILLS: Record<string, string> = {
  "#fff": "var(--avatar-white)",
  "#ffffff": "var(--avatar-white)",
  "#777777": "var(--avatar-grey)",
};

export function botAvatarFill(color: string): string {
  return THEMED_FILLS[color.toLowerCase()] ?? color;
}

const round = (value: number) => Math.round(value * 100) / 100;

export type { BotFace };

type EyeStroke = { d: string; width: number };

/** Each eye of a face as an SVG path and stroke width (the geometry lives in `@rakazo/core`). */
export function eyeStrokes(face: BotFace, unit: number, size: number): EyeStroke[] {
  return eyeQuads(face, unit, size).map((quad) => ({ d: eyeQuadPath(quad), width: quad.width }));
}

/** The original resting eyes (as at bddb011b): stadium rects tilted about their centers. */
function restingEyes(unit: number, size: number) {
  return restingEyeRects(unit, size).map(({ cx, cy, ...rect }) => (
    <rect
      key={cx}
      className="rakazo-character-eye-rest"
      {...rect}
      transform={`rotate(${BOT_EYES.tilt} ${cx} ${cy})`}
    />
  ));
}

/**
 * The eyes inside the gaze group that turns them toward the pointer. At rest they are the
 * original rects, so resting faces draw exactly as before; the curves draw every other face and
 * every morph (the open curve is the same stadium as the rect).
 */
function CharacterEyes({
  unit,
  size,
  face = "open",
  className,
}: {
  unit: number;
  size: number;
  face?: BotFace;
  className?: string;
}) {
  return (
    <g className="rakazo-character-gaze">
      <g className={cn("rakazo-character-eyes", className)} data-face={face}>
        {face === "open" ? restingEyes(unit, size) : null}
        {eyeStrokes(face, unit, size).map((eye, index) => (
          <path
            key={index === 0 ? "left" : "right"}
            className="rakazo-character-eye"
            d={eye.d}
            fill="none"
            stroke="black"
            strokeWidth={round(eye.width)}
            strokeLinecap="round"
            strokeLinejoin="round"
            visibility={face === "open" ? "hidden" : undefined}
          />
        ))}
      </g>
    </g>
  );
}

/** Grok's thinking face: three dots on the center line, as fractions of the avatar box. */
const DOTS = { gap: 0.33, radius: 0.12 };

function ThinkingDots({ center, unit, fill }: { center: number; unit: number; fill: string }) {
  return (
    <g className="rakazo-character-dots" style={{ fill }}>
      {[-1, 0, 1].map((offset) => (
        <circle
          key={offset}
          cx={round(center + offset * DOTS.gap * unit)}
          cy={center}
          r={round(DOTS.radius * unit)}
        />
      ))}
    </g>
  );
}

/** Where the eye pair sits in a square viewBox starting at `min`, `unit` wide. */
function eyeOrigin(min: number, unit: number, shape?: string) {
  const { x, y } = eyeOriginPoint(min, unit, shape);
  return `translate(${x} ${y})`;
}

/** Eyes are cut out of the body, so they show whatever sits behind the avatar, as in Grok. */
function EyeMask({
  id,
  min,
  unit,
  children,
}: {
  id: string;
  min: number;
  unit: number;
  children: ReactNode;
}) {
  // Padded so working animations and glows that leave the viewBox are not clipped.
  const region = { x: min - unit / 2, y: min - unit / 2, width: unit * 2, height: unit * 2 };
  return (
    <mask id={id} maskUnits="userSpaceOnUse" {...region}>
      <rect {...region} fill="white" />
      <g fill="black">{children}</g>
    </mask>
  );
}

const SHAPE_MIN = -15;
const SHAPE_UNIT = 259;

/**
 * A studio shape, flat in the bot color with cut-out eyes. `before` draws under the body.
 * With a `motion` it is a live character: working states, thinking dots and pointer gaze.
 */
function ShapeArt({
  shape,
  path,
  fill,
  maskId,
  size,
  className,
  before,
  motion,
  eyePattern,
}: {
  shape: string;
  path: string;
  fill: string;
  maskId: string;
  size: number;
  className?: string;
  before?: ReactNode;
  motion?: BotMotion;
  eyePattern?: number;
}) {
  const face = useBotFace(motion);
  const ref = useMotionBridge<SVGSVGElement>(motion, face);
  return (
    <svg
      ref={ref}
      viewBox={VIEWBOX}
      width={size}
      height={size}
      aria-hidden="true"
      className={cn(
        "overflow-visible",
        motion && "rakazo-character rakazo-shape-avatar",
        className,
      )}
      data-motion={motion}
      data-eye-pattern={eyePattern}
    >
      <defs>
        <EyeMask id={maskId} min={SHAPE_MIN} unit={SHAPE_UNIT}>
          <g transform={eyeOrigin(SHAPE_MIN, SHAPE_UNIT, shape)} className="bot-character-eyes">
            <CharacterEyes unit={SHAPE_UNIT} size={size} face={face} />
          </g>
        </EyeMask>
      </defs>
      {before}
      <g className="rakazo-character-body">
        <path d={path} mask={`url(#${maskId})`} style={{ fill }} />
      </g>
      {motion ? (
        <ThinkingDots center={SHAPE_MIN + SHAPE_UNIT / 2} unit={SHAPE_UNIT} fill={fill} />
      ) : null}
      {motion ? (
        <GlyphLayer
          motion={motion}
          center={SHAPE_MIN + SHAPE_UNIT / 2}
          unit={SHAPE_UNIT}
          size={size}
          fill={fill}
        />
      ) : null}
    </svg>
  );
}

export const BotAvatar = memo(function BotAvatar({
  color,
  size = 36,
  status,
  identity = "",
  className,
  variant,
  animated = false,
  motion: motionOverride,
  lively = false,
  call,
}: BotAvatarProps) {
  const id = useId().replace(/[^a-zA-Z0-9-_]/g, "");
  const isWorking = animated && ACTIVE_RUN_STATUSES.some((s) => s === status);
  const preferredVariant = useAvatarStyle();
  const liveMotion = useLiveBotMotion(identity);
  const isBlocked = animated && WAITING_ON_USER_RUN_STATUSES.some((s) => s === status);
  const settled = call
    ? CALL_MOTIONS[call]
    : (motionOverride ??
      (animated ? liveMotion : undefined) ??
      (isBlocked ? "blocked" : isWorking ? "busy" : "idle"));
  const motion = lively && settled === "idle" ? "idle-loop" : settled;

  const parsed = useMemo(() => parseBotAvatar(color, identity), [color, identity]);
  const effectiveId = identity || parsed.color || "agent";

  const colorDef = useMemo(
    () => resolvePersonaColorDef(effectiveId, parsed.color),
    [effectiveId, parsed.color],
  );

  const shapePath = useMemo(() => {
    if (parsed.shapeIndex !== undefined) {
      return shippedBotAvatarShapePath(parsed.shapeIndex);
    }
    return resolvePersonaShape(effectiveId);
  }, [parsed.shapeIndex, effectiveId]);

  if (parsed.isImage && parsed.imageUrl) {
    return (
      <div
        className={cn("rakazo-bot-avatar relative shrink-0 select-none", className)}
        data-working={isWorking}
        style={{ width: size, height: size }}
      >
        <div className="rakazo-bot-avatar-picture relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border bg-secondary">
          <img src={parsed.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
        {isWorking ? (
          <svg
            className="rakazo-bot-avatar-ring rakazo-bot-avatar-ring-working absolute z-10 pointer-events-none"
            style={{
              inset: -4,
              width: size + 8,
              height: size + 8,
            }}
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="24"
              cy="24"
              r="22"
              className="stroke-status-working"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="45 80"
            />
          </svg>
        ) : null}
      </div>
    );
  }

  if (parsed.shapeIndex === undefined && (variant ?? preferredVariant) === "organic") {
    return (
      <OrganicAvatar
        color={colorDef.hex}
        identity={effectiveId}
        size={size}
        motion={motion}
        className={className}
        maskId={`${id}-eyes`}
      />
    );
  }

  if (parsed.shapeIndex === undefined) {
    return (
      <RobotAvatar
        colorDef={colorDef}
        size={size}
        isWorking={isWorking}
        className={className}
        identity={effectiveId}
        gradientId={id}
      />
    );
  }

  return (
    <div
      className={cn(
        "rakazo-bot-avatar bot-avatar-container relative inline-flex items-center justify-center shrink-0 select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
      }}
      data-working={isWorking}
    >
      <ShapeArt
        shape={SHIPPED_SHAPE_KEYS[parsed.shapeIndex] ?? "hex"}
        path={shapePath}
        fill={botAvatarFill(colorDef.hex)}
        maskId={`${id}-eyes`}
        size={size}
        motion={motion}
        eyePattern={avatarIdentitySeed(effectiveId) % 4}
      />
    </div>
  );
});

/**
 * The silhouette BotAvatar draws, in its own viewBox: a picked shape or the organic blob.
 * Undefined when the avatar is a round disc (a photo or a robot).
 */
export function botAvatarOutline(
  color: string,
  identity: string,
  variant: AvatarStyle,
): { viewBox: string; paths: string[] } | undefined {
  const parsed = parseBotAvatar(color, identity);
  if (parsed.isImage) return undefined;
  if (parsed.shapeIndex !== undefined) {
    return { viewBox: VIEWBOX, paths: [shippedBotAvatarShapePath(parsed.shapeIndex)] };
  }
  if (variant !== "organic") return undefined;
  const seed = avatarIdentitySeed(identity || parsed.color || "agent");
  return { viewBox: "-60 -60 120 120", paths: [organicAvatarPath(seed)] };
}

/**
 * The bot's shape as a flat glyph in the current text color, for placeholders such as a
 * sleeping computer. Eyes take `eyeClassName` so they read as cut out of the surface.
 */
export function BotGlyph({
  color,
  identity = "",
  size,
  asleep = false,
  className,
  eyeClassName,
}: {
  color: string;
  identity?: string;
  size: number;
  asleep?: boolean;
  className?: string;
  eyeClassName?: string;
}) {
  const preferredVariant = useAvatarStyle();
  const parsed = parseBotAvatar(color, identity);
  const effectiveId = identity || parsed.color || "agent";
  // Same outline BotAvatar draws: a picked shape, else the organic blob or the persona shape.
  const organic = parsed.shapeIndex === undefined && preferredVariant === "organic";
  const frame = organic
    ? { viewBox: "-60 -60 120 120", x: 0, y: 0, dx: 12, unit: 1 }
    : { viewBox: VIEWBOX, x: CENTER, y: CENTER - 8, dx: 29, unit: 2.16 };
  const path =
    parsed.shapeIndex !== undefined
      ? shippedBotAvatarShapePath(parsed.shapeIndex)
      : organic
        ? organicAvatarPath(avatarIdentitySeed(effectiveId))
        : resolvePersonaShape(effectiveId);
  const eye = asleep ? { w: 20, h: 11 } : { w: 12, h: 26 };
  const w = eye.w * frame.unit;
  const h = eye.h * frame.unit;
  return (
    <svg
      viewBox={frame.viewBox}
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("overflow-visible", className)}
    >
      <path d={path} fill="currentColor" />
      <g className={eyeClassName}>
        {[-1, 1].map((side) => (
          <rect
            key={side}
            x={frame.x + side * frame.dx - w / 2}
            y={frame.y - h / 2}
            width={w}
            height={h}
            rx={Math.min(w, h) / 2}
          />
        ))}
      </g>
    </svg>
  );
}

const VISOR_BORDER_PX = 1;

function robotFaceLayout(size: number) {
  const visorW = Math.round(size * 0.68);
  const visorH = Math.round(size * 0.44);
  const visorInnerW = Math.max(0, visorW - VISOR_BORDER_PX * 2);
  const visorInnerH = Math.max(0, visorH - VISOR_BORDER_PX * 2);
  const preferredEyeW = Math.max(4, Math.round(size * 0.14));
  const preferredEyeH = Math.max(7, Math.round(size * 0.22));
  const preferredEyeGap = Math.max(3, Math.round(size * 0.1));
  const preferredSpan = preferredEyeW * 2 + preferredEyeGap;
  const scale = Math.min(1, visorInnerW / preferredSpan, visorInnerH / preferredEyeH);
  const eyeW = Math.floor(preferredEyeW * scale);
  const eyeH = Math.floor(preferredEyeH * scale);
  const eyeGap = Math.floor(preferredEyeGap * scale);
  const eyeRadius = Math.max(2, Math.round(eyeW * 0.5));
  return { visorW, visorH, eyeW, eyeH, eyeGap, eyeRadius };
}

function RobotAvatar({
  colorDef,
  size,
  isWorking,
  className,
  identity,
  gradientId,
}: {
  colorDef: BotColorDef;
  size: number;
  isWorking: boolean;
  className?: string;
  identity: string;
  gradientId: string;
}) {
  const seed = avatarIdentitySeed(identity || colorDef.hex);
  const eyeVariant = seed % 4;
  const idleDuration = (4.2 + ((seed * 7) % 28) / 10).toFixed(2);
  const idleDelay = (-(((seed * 13) % 45) / 10)).toFixed(2);
  const { visorW, visorH, eyeW, eyeH, eyeGap, eyeRadius } = robotFaceLayout(size);
  const idleEyeAnimation = {
    "--rakazo-eye-animation-name": `rakazo-eyes-idle-${eyeVariant}`,
    "--rakazo-eye-animation-duration": `${idleDuration}s`,
    "--rakazo-eye-animation-easing": "cubic-bezier(0.4, 0, 0.2, 1)",
    "--rakazo-eye-animation-delay": `${idleDelay}s`,
  } as CSSProperties;
  const workingEyeAnimation = {
    "--rakazo-eye-animation-name": "rakazo-eyes-working",
    "--rakazo-eye-animation-duration": "1.4s",
    "--rakazo-eye-animation-easing": "ease-in-out",
    "--rakazo-eye-animation-delay": "0s",
  } as CSSProperties;

  return (
    <div
      className={cn(
        "rakazo-bot-avatar relative inline-flex shrink-0 items-center justify-center rounded-full select-none",
        className,
      )}
      data-working={isWorking}
      style={{
        width: size,
        height: size,
        background: botAvatarFill(colorDef.hex),
        boxShadow: isWorking
          ? `0 0 0 2px rgba(255,255,255,0.25), 0 0 ${Math.round(size * 0.45)}px ${colorDef.hex}`
          : undefined,
      }}
    >
      <svg
        className="rakazo-bot-avatar-ring pointer-events-none absolute"
        style={{
          inset: -4,
          width: size + 8,
          height: size + 8,
          filter: `drop-shadow(0 0 6px ${colorDef.light}) drop-shadow(0 0 10px #ffffff)`,
        }}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          r="22"
          stroke={`url(#${gradientId}-ring)`}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="45 80"
        />
        <circle cx="43" cy="24" r="2.8" fill="#ffffff" />
        <defs>
          <linearGradient id={`${gradientId}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="60%" stopColor={colorDef.light} stopOpacity="0.9" />
            <stop offset="100%" stopColor={colorDef.light} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div
        className="rakazo-bot-avatar-visor relative flex items-center justify-center overflow-hidden"
        style={{
          width: visorW,
          height: visorH,
          boxSizing: "border-box",
          borderRadius: Math.round(visorH * 0.52),
          background: "linear-gradient(180deg, #101014 0%, #030305 100%)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        {(["idle", "working"] as const).map((mode) => (
          <div
            key={mode}
            className={`rakazo-bot-avatar-eyes rakazo-bot-avatar-eyes-${mode} absolute inset-0 z-10 flex items-center justify-center`}
            style={{
              gap: eyeGap,
              ...(mode === "idle" ? idleEyeAnimation : workingEyeAnimation),
            }}
          >
            {[0, 1].map((eye) => (
              <span
                key={eye}
                className="block"
                style={{
                  width: eyeW,
                  height: eyeH,
                  borderRadius: eyeRadius,
                  backgroundColor: "#fff",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrganicAvatar({
  color,
  identity,
  size,
  motion,
  className,
  maskId,
}: {
  color: string;
  identity?: string;
  size: number;
  motion: BotMotion;
  className?: string;
  maskId: string;
}) {
  const face = useBotFace(motion);
  const ref = useMotionBridge<SVGSVGElement>(motion, face);
  const seed = avatarIdentitySeed(identity || color || DEFAULT_BOT_AVATAR_COLOR);
  const shapeA = organicAvatarPath(seed);
  // The organic loops name busy work "working". The body breathes in every other state; the
  // eyes of other states take their own CSS.
  const bodyMode = motion === "busy" ? "working" : "idle";
  const eyeMode = motion === "busy" ? "working" : motion;

  return (
    <svg
      ref={ref}
      viewBox="-60 -60 120 120"
      aria-hidden="true"
      className={cn(
        "rakazo-organic-avatar rakazo-character overflow-visible select-none",
        className,
      )}
      data-working={motion !== "idle" && motion !== "done" && motion !== "failed"}
      data-motion={motion}
      data-shape-family={seed % 10}
      data-eye-pattern={seed % 4}
      style={{
        width: size,
        height: size,
        flex: "none",
      }}
    >
      <defs>
        <EyeMask id={maskId} min={-60} unit={120}>
          <g transform={`${eyeOrigin(-60, 120)} rotate(${(seed % 9) - 4})`}>
            <CharacterEyes
              unit={120}
              size={size}
              face={face}
              className={`rakazo-organic-avatar-eyes rakazo-organic-avatar-eyes-${eyeMode}`}
            />
          </g>
        </EyeMask>
      </defs>
      <g className="rakazo-character-body" mask={`url(#${maskId})`}>
        <path
          className={`rakazo-organic-avatar-body rakazo-organic-avatar-body-${bodyMode}`}
          d={shapeA}
          style={
            {
              "--rakazo-organic-path": `path("${shapeA}")`,
              fill: botAvatarFill(color),
            } as CSSProperties
          }
        />
      </g>
      <ThinkingDots center={0} unit={120} fill={botAvatarFill(color)} />
      <GlyphLayer motion={motion} center={0} unit={120} size={size} fill={botAvatarFill(color)} />
    </svg>
  );
}

/** Box of a studio shape, and its selection ring: 1px, 3px off the outline, as in Grok. */
const PREVIEW_SIZE = 40;
const PREVIEW_PX = SHAPE_UNIT / PREVIEW_SIZE;

export function BotShapePreview({
  shapeIndex,
  color,
  selected,
  onClick,
}: {
  shapeIndex: number;
  color: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const maskId = `${useId().replace(/[^a-zA-Z0-9-_]/g, "")}-eyes`;
  const key = SHIPPED_SHAPE_KEYS[shapeIndex % SHIPPED_SHAPE_KEYS.length] ?? "hex";
  const path = shippedBotAvatarShapePath(shapeIndex);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={key}
      aria-pressed={selected ?? false}
      className="flex size-14 items-center justify-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ShapeArt
        shape={key}
        path={path}
        fill={botAvatarFill(color)}
        maskId={maskId}
        size={PREVIEW_SIZE}
        before={
          selected ? (
            <g fill="none" strokeLinejoin="round">
              <path d={path} className="stroke-input-focus" strokeWidth={8 * PREVIEW_PX} />
              <path d={path} className="stroke-popover" strokeWidth={6 * PREVIEW_PX} />
            </g>
          ) : null
        }
      />
    </button>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-full bg-card">
        <span className="h-4 w-[7px] rounded-full bg-primary" />
        <span className="h-4 w-[7px] rounded-full bg-primary" />
      </div>
      <span className="font-[Aeonik,ui-sans-serif] text-[28px] tracking-tight text-foreground">
        Rakazo
      </span>
    </div>
  );
}

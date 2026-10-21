import type { BotColorDef } from "@rakazo/core";
import {
  ACTIVE_RUN_STATUSES,
  avatarIdentitySeed,
  BOT_AVATAR_COLORS,
  BOT_COLOR_LIST,
  DEFAULT_BOT_AVATAR_COLOR,
  organicAvatarPath,
  resolvePersonaColorDef,
  SHIPPED_BOT_AVATAR_CENTER,
  SHIPPED_BOT_AVATAR_SHAPE_KEYS,
  SHIPPED_BOT_AVATAR_SHAPES,
  SHIPPED_BOT_AVATAR_VIEWBOX,
  shippedBotAvatarShapePath,
  shippedHash,
} from "@rakazo/core";
import type { CSSProperties, ReactNode } from "react";
import { memo, useId, useMemo, useSyncExternalStore } from "react";
import type { AvatarStyle } from "./avatar-style.js";
import { useAvatarStyle } from "./avatar-style.js";
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

/**
 * Grok Bot's eyes as fractions of the avatar box (measured at 16, 24, 40 and 72px): two
 * stadiums tilted 28deg left, the pair rising 15deg to the right, set up and right of center.
 * Their length also has a fixed `lengthPx`, so small avatars keep readable eyes.
 */
const EYES = {
  length: 0.19,
  lengthPx: 0.75,
  width: 0.085,
  gap: 0.18,
  rise: 15,
  tilt: -28,
  x: 0.11,
  y: -0.12,
};

/** Pointed studio shapes are too narrow up top, so their eyes sit lower. */
const SHAPE_EYES: Partial<Record<string, { x: number; y: number }>> = {
  wedge: { x: 0.03, y: -0.04 },
  teardrop: { x: 0.11, y: -0.06 },
};

const round = (value: number) => Math.round(value * 100) / 100;

/** The eye pair centered on (0, 0) for a `size`px box `unit` viewBox units wide. */
function eyePair(unit: number, size: number) {
  const w = round(EYES.width * unit);
  const h = round((EYES.length + EYES.lengthPx / size) * unit);
  const rise = (EYES.rise * Math.PI) / 180;
  return [-1, 1].map((side) => {
    const cx = round((side * EYES.gap * unit * Math.cos(rise)) / 2);
    const cy = round((-side * EYES.gap * unit * Math.sin(rise)) / 2);
    return (
      <rect
        key={side}
        x={round(cx - w / 2)}
        y={round(cy - h / 2)}
        width={w}
        height={h}
        rx={round(w / 2)}
        transform={`rotate(${EYES.tilt} ${cx} ${cy})`}
      />
    );
  });
}

/** Where the eye pair sits in a square viewBox starting at `min`, `unit` wide. */
function eyeOrigin(min: number, unit: number, at: { x: number; y: number } = EYES) {
  const center = min + unit / 2;
  return `translate(${round(center + at.x * unit)} ${round(center + at.y * unit)})`;
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

/** A studio shape, flat in the bot color with cut-out eyes. `before` draws under the body. */
function ShapeArt({
  shape,
  path,
  fill,
  maskId,
  size,
  className,
  style,
  before,
}: {
  shape: string;
  path: string;
  fill: string;
  maskId: string;
  size: number;
  className?: string;
  style?: CSSProperties;
  before?: ReactNode;
}) {
  return (
    <svg
      viewBox={VIEWBOX}
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("overflow-visible", className)}
      style={style}
    >
      <defs>
        <EyeMask id={maskId} min={SHAPE_MIN} unit={SHAPE_UNIT}>
          <g
            transform={eyeOrigin(SHAPE_MIN, SHAPE_UNIT, SHAPE_EYES[shape])}
            className="bot-character-eyes"
          >
            {eyePair(SHAPE_UNIT, size)}
          </g>
        </EyeMask>
      </defs>
      {before}
      <path d={path} mask={`url(#${maskId})`} style={{ fill }} />
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
}: BotAvatarProps) {
  const id = useId().replace(/[^a-zA-Z0-9-_]/g, "");
  const isWorking = ACTIVE_RUN_STATUSES.some((s) => s === status);
  const preferredVariant = useAvatarStyle();

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
        isWorking={isWorking}
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
      <svg
        className="rakazo-bot-avatar-ring absolute pointer-events-none"
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
          stroke={`url(#${id}-ring)`}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray="45 80"
        />
        <circle cx="43" cy="24" r="2.8" fill="#ffffff" />
        <defs>
          <linearGradient id={`${id}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="60%" stopColor={colorDef.light} stopOpacity="0.9" />
            <stop offset="100%" stopColor={colorDef.light} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <ShapeArt
        shape={SHIPPED_SHAPE_KEYS[parsed.shapeIndex] ?? "hex"}
        path={shapePath}
        fill={botAvatarFill(colorDef.hex)}
        maskId={`${id}-eyes`}
        size={size}
        className={cn(
          "transition-transform duration-300",
          isWorking && "animate-pulse scale-[1.04] motion-reduce:animate-none",
        )}
        style={
          isWorking
            ? { filter: `drop-shadow(0 0 8px ${colorDef.light}) drop-shadow(0 0 2px #ffffff)` }
            : undefined
        }
      />
    </div>
  );
});

/**
 * The silhouette BotAvatar draws, in its own viewBox: a picked shape or the organic blob (both
 * ends of its idle morph). Undefined when the avatar is a round disc (a photo or a robot).
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
  return {
    viewBox: "-60 -60 120 120",
    paths: [organicAvatarPath(seed), organicAvatarPath(seed, 0.42)],
  };
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
  isWorking,
  className,
  maskId,
}: {
  color: string;
  identity?: string;
  size: number;
  isWorking: boolean;
  className?: string;
  maskId: string;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );
  const seed = avatarIdentitySeed(identity || color || DEFAULT_BOT_AVATAR_COLOR);
  const duration = `${4.8 + (seed % 24) / 10}s`;
  const shapeA = organicAvatarPath(seed);
  const shapeB = organicAvatarPath(seed, 0.42);

  return (
    <svg
      viewBox="-60 -60 120 120"
      aria-hidden="true"
      className={cn("rakazo-organic-avatar overflow-visible select-none", className)}
      data-working={isWorking}
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
            {(["idle", "working"] as const).map((mode) => (
              <g
                key={mode}
                className={`rakazo-organic-avatar-eyes rakazo-organic-avatar-eyes-${mode}`}
              >
                {eyePair(120, size)}
              </g>
            ))}
          </g>
        </EyeMask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {(["idle", "working"] as const).map((mode) => (
          <path
            key={mode}
            className={`rakazo-organic-avatar-body rakazo-organic-avatar-body-${mode}`}
            d={shapeA}
            style={
              {
                "--rakazo-organic-path": `path("${shapeA}")`,
                fill: botAvatarFill(color),
                filter:
                  mode === "working"
                    ? `drop-shadow(0 0 ${Math.round(size * 0.16)}px ${color})`
                    : undefined,
              } as CSSProperties
            }
          >
            {!reducedMotion ? (
              <animate
                attributeName="d"
                values={`${shapeA};${shapeB};${shapeA}`}
                dur={duration}
                repeatCount="indefinite"
              />
            ) : null}
          </path>
        ))}
      </g>
    </svg>
  );
}

const reducedMotionMedia = "(prefers-reduced-motion: reduce)";

function reducedMotionSnapshot(): boolean {
  return window.matchMedia(reducedMotionMedia).matches;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(reducedMotionMedia);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
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

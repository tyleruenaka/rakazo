import type { AvatarStyle } from "@rakazo/contracts";
import type { BotMotion, CallAvatarState } from "@rakazo/core";
import {
  ACTIVE_RUN_STATUSES,
  avatarIdentitySeed,
  CALL_MOTIONS,
  eyeOrigin,
  ORGANIC_FRAME,
  organicAvatarPath,
  PRIMARY_STAR_PATH,
  primaryStarGeometry,
  SHAPE_FRAME,
  SHIPPED_BOT_AVATAR_SHAPE_KEYS,
  WAITING_ON_USER_RUN_STATUSES,
} from "@rakazo/core";
import { memo } from "react";
import { Image, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { mobileBotAvatarPresentation } from "../lib/bot-avatar";
import { useLiveBotMotion } from "../lib/bot-motion";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { useAvatarStyle } from "./avatar-style";
import { BotCharacter } from "./bot-character";
import { NativeSymbol } from "./native-symbol";

/** Grok's white and grey swatches follow the theme: white draws black in light mode. */
function useAvatarFill(color: string): string {
  const tokens = useMobileTokens();
  const lower = color.toLowerCase();
  if (lower === "#fff" || lower === "#ffffff") return tokens.avatarWhite;
  if (lower === "#777777") return tokens.avatarGrey;
  return color;
}

export const BotAvatar = memo(function BotAvatar({
  color,
  size = 54,
  status,
  identity,
  variant,
  muted = false,
  primary = false,
  animated = false,
  lively = false,
  motion: motionOverride,
  call,
}: {
  color: string;
  size?: number;
  status?: string;
  identity?: string;
  variant?: AvatarStyle;
  muted?: boolean;
  /** The owner's Primary bot: Grok's star in the corner, unless a status badge holds it. */
  primary?: boolean;
  /**
   * Shows the bot's live working faces (from the motion provider, else `status`). As in Grok,
   * only roster rows and the thread's status line animate; other avatars stay still.
   */
  animated?: boolean;
  /** At rest, plays Grok's idle loop (glances and a blink every 2s), as the open chat does. */
  lively?: boolean;
  /** Overrides the live motion and the working fallback. */
  motion?: BotMotion;
  /** The in-call face, set by the call bar; it wins over everything else. */
  call?: CallAvatarState;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const isWorking = ACTIVE_RUN_STATUSES.some((activeStatus) => activeStatus === status);
  const { avatarStyle } = useAvatarStyle();
  const liveMotion = useLiveBotMotion(animated ? identity : undefined);
  const isBlocked = WAITING_ON_USER_RUN_STATUSES.some((s) => s === status);
  const settled = call
    ? CALL_MOTIONS[call]
    : (motionOverride ??
      liveMotion ??
      (animated && isBlocked ? "blocked" : animated && isWorking ? "busy" : "idle"));
  const motion: BotMotion = lively && settled === "idle" ? "idle-loop" : settled;
  const parsed = mobileBotAvatarPresentation(color);
  const fillColor = useAvatarFill(
    parsed.kind === "shape" || parsed.kind === "color" ? parsed.color : color,
  );
  const visorW = Math.round(size * 0.68);
  const visorH = Math.round(size * 0.44);
  const eyeW = Math.max(3, Math.round(size * 0.11));
  const eyeH = Math.max(4, Math.round(size * 0.17));
  const gap = Math.max(3, Math.round(size * 0.11));
  const picture =
    parsed.kind === "image" && parsed.imageUrl ? (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        }}
      >
        <Image source={{ uri: parsed.imageUrl }} style={{ width: size, height: size }} />
      </View>
    ) : parsed.kind === "shape" ? (
      <BotCharacter
        path={parsed.shapePath}
        fill={fillColor}
        size={size}
        min={SHAPE_FRAME.min}
        unit={SHAPE_FRAME.unit}
        eyes={{
          ...eyeOrigin(
            SHAPE_FRAME.min,
            SHAPE_FRAME.unit,
            SHIPPED_BOT_AVATAR_SHAPE_KEYS[parsed.shapeIndex % SHIPPED_BOT_AVATAR_SHAPE_KEYS.length],
          ),
          rotate: 0,
        }}
        motion={motion}
        organic={false}
        seed={avatarIdentitySeed(identity || parsed.color || "agent")}
      />
    ) : (variant ?? avatarStyle) === "organic" ? (
      <OrganicAvatar color={fillColor} identity={identity} size={size} motion={motion} />
    ) : (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fillColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: visorW,
            height: visorH,
            borderRadius: Math.round(visorH * 0.52),
            backgroundColor: "#0C0C0E",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap,
          }}
        >
          {[0, 1].map((eye) => (
            <View
              key={eye}
              style={{
                width: eyeW,
                height: eyeH,
                borderRadius: Math.max(2, Math.round(eyeW * 0.6)),
                backgroundColor: "#fff",
              }}
            />
          ))}
        </View>
      </View>
    );
  return (
    <View style={{ width: size, height: size }}>
      {picture}
      {isWorking && !animated ? (
        <View
          accessibilityLabel={t("Working")}
          style={{
            position: "absolute",
            right: muted ? undefined : 0,
            left: muted ? 0 : undefined,
            bottom: 0,
            width: Math.max(6, Math.round(size * 0.18)),
            height: Math.max(6, Math.round(size * 0.18)),
            borderRadius: size,
            backgroundColor: "#F5A03C",
          }}
        />
      ) : null}
      {primary && !muted && !(isWorking && !animated) ? (
        <PrimaryStar size={size} label={t("Primary")} tokens={tokens} />
      ) : null}
      {muted ? (
        <View
          accessible
          accessibilityLabel={t("Notifications silenced")}
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: Math.max(14, Math.round(size * 0.34)),
            height: Math.max(14, Math.round(size * 0.34)),
            borderRadius: size,
            borderWidth: 2,
            borderColor: "#000",
            backgroundColor: "#242428",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol
            ios="bell.slash.fill"
            android="notifications-off"
            size={Math.max(8, Math.round(size * 0.17))}
            color="#ECECEE"
          />
        </View>
      ) : null}
    </View>
  );
});

/**
 * Grok's Primary star, flush with the avatar box's bottom-right corner. Native views can't
 * cut the avatar, so a ring in the page color draws the gap around the badge.
 */
function PrimaryStar({
  size,
  label,
  tokens,
}: {
  size: number;
  label: string;
  tokens: ReturnType<typeof useMobileTokens>;
}) {
  const { badge, glyph, gap } = primaryStarGeometry(size);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        position: "absolute",
        right: -gap,
        bottom: -gap,
        width: badge + gap * 2,
        height: badge + gap * 2,
        borderRadius: size,
        borderWidth: gap,
        borderColor: tokens.inboxBackground,
        backgroundColor: tokens.primaryStar,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <Path
          d={PRIMARY_STAR_PATH}
          fill={tokens.primaryStarForeground}
          stroke={tokens.primaryStarForeground}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/** The organic blob: the same character, in its own viewBox, its eyes tilted a few degrees. */
function OrganicAvatar({
  color,
  identity,
  size,
  motion,
}: {
  color: string;
  identity?: string;
  size: number;
  motion: BotMotion;
}) {
  const seed = avatarIdentitySeed(identity || color || "#8B5CF6");
  return (
    <BotCharacter
      path={organicAvatarPath(seed)}
      fill={color}
      size={size}
      min={ORGANIC_FRAME.min}
      unit={ORGANIC_FRAME.unit}
      eyes={{ ...eyeOrigin(ORGANIC_FRAME.min, ORGANIC_FRAME.unit), rotate: (seed % 9) - 4 }}
      motion={motion}
      organic
      seed={seed}
    />
  );
}

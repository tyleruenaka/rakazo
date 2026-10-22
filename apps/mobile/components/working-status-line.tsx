import type { ActivityKind, BotMotion } from "@rakazo/core";
import { formatStepElapsed } from "@rakazo/core";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { activityPhrases } from "../lib/activity-phrases";
import { useLiveBotMotion } from "../lib/bot-motion";
import { useMobileTokens } from "../lib/native";
import { BotAvatar } from "./bot-avatar";

/** Grok's status line leaves with a 140ms fade and shrink once the work is over. */
const EXIT_MS = 140;
const ENTER_MS = 180;
/** Grok adds the time spent on a step once it passes a minute. */
const ELAPSED_AFTER_MS = 60_000;
/** The shimmer sweeps across the phrase every 2.2s. */
const SHIMMER_MS = 2200;

type Bot = { botId: string; color: string; status?: string };

/**
 * The thread's live status line, as on desktop and in Grok: the working bot's animated avatar
 * and a shimmering phrase for what it is doing, with the time on the step after a minute.
 */
export function WorkingStatusLine({
  running,
  bot,
  kind,
  since,
  label,
}: {
  running: boolean;
  bot: Bot | null;
  kind: ActivityKind;
  /** When the current step started, if this thread saw it start. */
  since?: number;
  /** "Ezra is working", for screen readers. */
  label: string;
}) {
  // The line keeps its last bot and phrase while it leaves.
  const last = useRef({ bot, kind, since, label });
  if (running && bot) last.current = { bot, kind, since, label };
  const [mounted, setMounted] = useState(running && Boolean(bot));
  if (running && bot && !mounted) setMounted(true);
  useEffect(() => {
    if (running || !mounted) return;
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [running, mounted]);
  const current = last.current;
  if (!mounted || !current.bot) return null;
  return <StatusLine {...current} bot={current.bot} exiting={!running} />;
}

function StatusLine({
  bot,
  kind,
  since,
  label,
  exiting,
}: {
  bot: Bot;
  kind: ActivityKind;
  since?: number;
  label: string;
  exiting: boolean;
}) {
  const tokens = useMobileTokens();
  const still = useReducedMotion();
  const phrase = usePhrase(kind);
  const elapsed = useStepElapsed(kind, since);
  // A leaving line keeps the face it had while working, not the done face.
  const live = useLiveBotMotion(bot.botId);
  const face = useRef<BotMotion | undefined>(live);
  if (!exiting) face.current = live;

  const shown = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(exiting ? 0 : 1, {
      duration: exiting ? EXIT_MS : ENTER_MS,
      easing: exiting ? Easing.out(Easing.ease) : Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [exiting, shown]);
  const lineStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.92 + 0.08 * shown.value }],
  }));

  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          height: 36,
          paddingStart: 8,
          transformOrigin: "left center",
        },
        lineStyle,
      ]}
    >
      <BotAvatar
        color={bot.color}
        identity={bot.botId}
        size={28}
        status={bot.status}
        motion={face.current}
        animated
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
        <ShimmerText text={phrase} color={tokens.foreground} still={still} />
        {elapsed === null ? null : (
          <Text style={{ fontSize: 12, color: tokens.mutedForeground }}>
            · {formatStepElapsed(elapsed)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * A light band sweeping across the phrase: the text at 40%, and the same text at full strength
 * seen through a moving window, as web's gradient shimmer.
 */
function ShimmerText({ text, color, still }: { text: string; color: string; still: boolean }) {
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    sweep.value = 0;
    sweep.value = withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.linear }), -1);
  }, [still, sweep]);
  const band = Math.max(24, width * 0.35);
  const windowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + (width + band * 2) * sweep.value - band / 2 }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(-band + (width + band * 2) * sweep.value - band / 2) }],
  }));
  const textStyle = { fontSize: 15, lineHeight: 20, color };
  return (
    <View style={{ flexShrink: 1 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Text numberOfLines={1} style={[textStyle, { opacity: still ? 0.7 : 0.4 }]}>
        {text}
      </Text>
      {still ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, bottom: 0, width: band, overflow: "hidden" },
            windowStyle,
          ]}
        >
          <Animated.View style={[{ width }, innerStyle]}>
            <Text numberOfLines={1} style={textStyle}>
              {text}
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

/** The phrase for `kind`: a variant drawn each time a new step starts. */
function usePhrase(kind: ActivityKind): string {
  const [step, setStep] = useState(() => ({ kind, draw: Math.random() }));
  let current = step;
  if (step.kind !== kind) {
    current = { kind, draw: Math.random() };
    setStep(current);
  }
  const phrases = activityPhrases(current.kind);
  return phrases[Math.floor(current.draw * phrases.length)] ?? phrases[0] ?? "";
}

/** Time on the current step once it passes a minute, refreshed each minute. */
function useStepElapsed(kind: ActivityKind, since: number | undefined): number | null {
  const [seen, setSeen] = useState(() => ({ kind, at: Date.now() }));
  let shownAt = seen.at;
  if (seen.kind !== kind) {
    shownAt = Date.now();
    setSeen({ kind, at: shownAt });
  }
  const start = since ?? shownAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const elapsed = Date.now() - start;
    const wait =
      elapsed < ELAPSED_AFTER_MS ? ELAPSED_AFTER_MS - elapsed : 60_000 - (elapsed % 60_000);
    const timer = setTimeout(() => setNow(Date.now()), wait + 20);
    return () => clearTimeout(timer);
  }, [start, now]);
  const elapsed = Math.max(now, Date.now()) - start;
  return elapsed >= ELAPSED_AFTER_MS ? elapsed : null;
}

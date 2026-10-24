import type { CallAvatarState } from "@rakazo/core";
import { typeScale } from "@rakazo/ui-tokens";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { endCall, toggleMute, useCallSession } from "../lib/call-session";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { userBubbleColor } from "../lib/user-bubble-color";
import { BotAvatar } from "./bot-avatar";
import { NativeSymbol } from "./native-symbol";

/** Level bars across the call bar; each animates between a dot and its peak height. */
const BARS = [12, 20, 28, 18, 24, 14, 30, 22, 16, 26, 20, 12, 24, 30, 18, 22, 14, 26, 20, 16];
const DOT = 3;
const TRANSCRIPT_LINES = 8;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A call lives in the foreground: once the screen locks, Android pauses the app and the
 * microphone, recognition, and reply feed stop until it is unlocked. Mounted only while a
 * call is up, so the screen sleeps normally the rest of the time.
 */
function KeepScreenOnDuringCall() {
  useKeepAwake("rakazo-call");
  return null;
}

export function CallCard() {
  const call = useCallSession();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const callKey = call ? call.botId : null;
  const reduceMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!expanded || reduceMotion) return;
    // The expanded call drops down out of the bar.
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [expanded, reduceMotion, reveal]);

  useEffect(() => {
    setExpanded(false);
    if (!callKey) return;
    setStartedAt(Date.now());
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callKey]);

  if (!call) return null;
  const still = call.phase === "thinking" || (call.phase === "listening" && call.muted);
  const mute = (
    <RoundButton
      label={call.muted ? t("Unmute") : t("Mute")}
      ios={call.muted ? "mic.slash" : "mic"}
      android={call.muted ? "mic-off-outline" : "mic-outline"}
      size={expanded ? 48 : 44}
      color={tokens.foreground}
      background={expanded ? tokens.muted : tokens.accent}
      border={expanded ? tokens.composerControlBorder : undefined}
      onPress={toggleMute}
    />
  );
  const settings = (
    <RoundButton
      label={t("Settings")}
      ios="gearshape"
      android="settings-outline"
      size={expanded ? 48 : 44}
      color={tokens.foreground}
      background={expanded ? tokens.muted : tokens.accent}
      border={expanded ? tokens.composerControlBorder : undefined}
      onPress={() => router.push("/voice")}
    />
  );
  const hangUp = (
    <RoundButton
      label={t("Hang up")}
      ios="xmark"
      android="close"
      size={expanded ? 48 : 44}
      color={tokens.destructiveForeground}
      background={tokens.callHangUp}
      onPress={endCall}
    />
  );
  if (expanded) {
    return (
      <Animated.View
        style={[
          styles.expanded,
          {
            backgroundColor: tokens.background,
            paddingTop: insets.top + 6,
            paddingBottom: insets.bottom - 4,
            opacity: reveal,
            transform: [
              { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] }) },
            ],
          },
        ]}
      >
        <KeepScreenOnDuringCall />
        <View style={styles.expandedTop}>
          <RoundButton
            label={t("Collapse")}
            ios="chevron.up"
            android="chevron-up"
            size={44}
            color={tokens.foreground}
            background={tokens.muted}
            border={tokens.composerControlBorder}
            onPress={() => setExpanded(false)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("On a call with {name}", { name: call.botName })}
          onPress={() => {
            setExpanded(false);
            router.push({ pathname: "/thread", params: { botId: call.botId, name: call.botName } });
          }}
          style={styles.identity}
        >
          <BotAvatar
            color={call.botColor}
            identity={call.botId}
            size={64}
            call={callAvatarState(call)}
          />
          <Text numberOfLines={1} style={[styles.expandedName, { color: tokens.foreground }]}>
            {call.botName}
          </Text>
          <Text style={[styles.timer, { color: tokens.mutedForeground }]}>
            {clock(Math.max(0, Math.floor((now - startedAt) / 1000)))}
          </Text>
        </Pressable>
        <ScrollTranscript call={call} />
        <View style={styles.expandedActions}>
          {mute}
          {settings}
          <View style={{ flex: 1 }} />
          {hangUp}
        </View>
      </Animated.View>
    );
  }
  return (
    <View
      style={[
        styles.bar,
        {
          top: insets.top + 74,
          backgroundColor: tokens.muted,
          borderColor: tokens.composerControlBorder,
        },
      ]}
    >
      <KeepScreenOnDuringCall />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("On a call with {name}", { name: call.botName })}
        onPress={() =>
          router.push({ pathname: "/thread", params: { botId: call.botId, name: call.botName } })
        }
      >
        <BotAvatar
          color={call.botColor}
          identity={call.botId}
          size={38}
          call={callAvatarState(call)}
        />
      </Pressable>
      {call.micBlocked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Open Settings")}
          onPress={() => void Linking.openSettings()}
          style={styles.levels}
        >
          <Text numberOfLines={1} style={[styles.blocked, { color: tokens.foreground }]}>
            {t("Microphone is off")}
          </Text>
          <Text numberOfLines={1} style={[styles.blocked, { color: tokens.mutedForeground }]}>
            {t("Open Settings")}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Expand")}
          onPress={() => setExpanded(true)}
          style={styles.levels}
        >
          <Waveform color={call.botColor} still={still} speaking={call.phase === "speaking"} />
        </Pressable>
      )}
      {settings}
      {mute}
      {hangUp}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Expand")}
        hitSlop={8}
        onPress={() => setExpanded(true)}
        style={styles.grabberHit}
      >
        <View style={[styles.grabber, { backgroundColor: tokens.composerIcon }]} />
      </Pressable>
    </View>
  );
}

/** The live call transcript under the caller in the expanded view. */
function ScrollTranscript({ call }: { call: NonNullable<ReturnType<typeof useCallSession>> }) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const live = call.caption || call.heard;
  return (
    <View style={styles.transcript}>
      {call.exchanges.slice(-TRANSCRIPT_LINES).map((exchange, index) => (
        <Text
          key={`${exchange.role}-${index + 1}-${exchange.text.slice(0, 24)}`}
          style={[
            styles.turn,
            exchange.role === "user"
              ? {
                  alignSelf: "flex-end",
                  backgroundColor:
                    userBubbleColor({ id: call.botId, color: call.botColor }) ?? tokens.chatUser,
                  color: tokens.chatUserForeground,
                }
              : {
                  alignSelf: "flex-start",
                  backgroundColor: tokens.callTurnBot,
                  color: tokens.foreground,
                },
          ]}
        >
          {exchange.text}
        </Text>
      ))}
      {live ? (
        <Text numberOfLines={2} style={[styles.live, { color: tokens.mutedForeground }]}>
          {live}
        </Text>
      ) : null}
      {call.micBlocked ? (
        <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
          <Text style={[styles.live, { color: tokens.foreground }]}>{t("Open Settings")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RoundButton({
  label,
  ios,
  android,
  size,
  color,
  background,
  border,
  onPress,
}: {
  label: string;
  ios: string;
  android: ComponentProps<typeof NativeSymbol>["android"];
  size: number;
  color: string;
  background: string;
  border?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        borderWidth: border ? 1 : 0,
        borderColor: border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <NativeSymbol ios={ios} android={android} size={size >= 48 ? 22 : 20} color={color} />
    </Pressable>
  );
}

function Waveform({
  color,
  still: stillPhase,
  speaking,
}: {
  color: string;
  still: boolean;
  speaking: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const values = useRef(BARS.map(() => new Animated.Value(0))).current;
  const still = stillPhase || reduceMotion;

  useEffect(() => {
    if (still) {
      for (const value of values) value.setValue(0);
      return;
    }
    const duration = speaking ? 220 : 420;
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((index * 53) % 300),
          Animated.timing(value, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.25, duration, useNativeDriver: true }),
        ]),
      ),
    );
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [speaking, still, values]);

  return (
    <View accessible={false} style={styles.waveform}>
      {BARS.map((height, index) => (
        <Animated.View
          key={`bar-${index + 1}`}
          style={{
            width: DOT,
            height,
            borderRadius: DOT / 2,
            backgroundColor: color,
            // Quiet bars collapse to faint dots, as the line sits idle between turns.
            opacity: still ? 0.2 : 1,
            transform: [
              {
                scaleY: still
                  ? DOT / height
                  : (values[index]?.interpolate({
                      inputRange: [0, 1],
                      outputRange: [DOT / height, 1],
                    }) ?? 1),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    start: 18,
    end: 18,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingStart: 22,
    paddingEnd: 15,
    zIndex: 50,
  },
  levels: { flex: 1, marginStart: 4, marginEnd: 6, height: 44, justifyContent: "center" },
  blocked: { fontSize: 13, fontWeight: "600" },
  waveform: { flexDirection: "row", alignItems: "center", gap: 3 },
  grabberHit: {
    position: "absolute",
    bottom: 0,
    start: 150,
    end: 150,
    height: 7,
    alignItems: "center",
  },
  grabber: { width: 47, height: 3, borderRadius: 1.5 },
  expanded: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    zIndex: 60,
    paddingHorizontal: 18,
  },
  expandedTop: { flexDirection: "row", height: 50 },
  identity: { alignItems: "center", marginTop: -28 },
  expandedName: { fontSize: 22, fontWeight: "600", marginTop: 13, writingDirection: "auto" },
  timer: { fontSize: 17, marginTop: 5, fontVariant: ["tabular-nums"] },
  transcript: { flex: 1, marginTop: 28, marginBottom: 20, gap: 8, justifyContent: "flex-end" },
  turn: {
    ...typeScale.body,
    maxWidth: "80%",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: "hidden",
    writingDirection: "auto",
  },
  live: { ...typeScale.secondary, textAlign: "center", writingDirection: "auto" },
  expandedActions: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12 },
});

/**
 * The bot's face in the call, as Grok maps it: the caller speaking (words heard while the mic is
 * open), the bot thinking or speaking, and quiet otherwise.
 */
export function callAvatarState(call: { phase: string; heard: string }): CallAvatarState {
  if (call.phase === "thinking" || call.phase === "speaking") return call.phase;
  return call.phase === "listening" && call.heard.trim() ? "listening" : "idle";
}

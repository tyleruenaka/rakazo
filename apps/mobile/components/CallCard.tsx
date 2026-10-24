import { parseBotAvatarValue } from "@rakazo/contracts";
import type { CallAvatarState } from "@rakazo/core";
import { typeScale } from "@rakazo/ui-tokens";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CALL_LANGUAGE_LABELS,
  CALL_LANGUAGES,
  CALL_SPEEDS,
  setCallPreferences,
  useCallPreferences,
} from "../lib/call-preferences";
import { type CallState, endCall, toggleMute, useCallSession } from "../lib/call-session";
import { type CallVoice, loadCallVoice } from "../lib/call-voice";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { BotAvatar, useAvatarFill } from "./bot-avatar";
import { MenuPicker } from "./menu-picker";
import { NativeSymbol } from "./native-symbol";

/** Level bars across the call bar; each animates between a dot and its peak height. */
// Sixteen fit between the avatar and the buttons on a normal-size iPhone.
const BARS = [12, 20, 28, 18, 24, 14, 30, 22, 16, 26, 20, 12, 24, 30, 18, 22];
const DOT = 3;
/** A downward drag this long on the call bar opens the full call. */
const PULL_TO_EXPAND = 12;

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    setSettingsOpen(false);
    if (!callKey) return;
    setStartedAt(Date.now());
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callKey]);

  const pullDown = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > PULL_TO_EXPAND && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: () => setExpanded(true),
      }),
    [],
  );
  const levelColor = useLevelColor(call?.botColor ?? "");

  if (!call) return null;
  const still = call.phase === "thinking" || (call.phase === "listening" && call.muted);
  const collapse = () => {
    setExpanded(false);
    setSettingsOpen(false);
  };
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
  // The gear opens the call's own settings card in the full call, lit while it is open.
  const settingsLit = expanded && settingsOpen;
  const settings = (
    <RoundButton
      label={t("Settings")}
      ios={settingsLit ? "gearshape.fill" : "gearshape"}
      android={settingsLit ? "settings" : "settings-outline"}
      size={expanded ? 48 : 44}
      color={settingsLit ? tokens.background : tokens.foreground}
      background={settingsLit ? tokens.foreground : expanded ? tokens.muted : tokens.accent}
      border={expanded && !settingsLit ? tokens.composerControlBorder : undefined}
      selected={settingsLit}
      onPress={() => {
        if (!expanded) setExpanded(true);
        setSettingsOpen(!settingsLit);
      }}
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
            onPress={collapse}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("On a call with {name}", { name: call.botName })}
          onPress={() => {
            collapse();
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
        {settingsOpen ? <CallSettingsCard botId={call.botId} /> : null}
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
      {...pullDown.panHandlers}
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
          <Waveform color={levelColor} still={still} speaking={call.phase === "speaking"} />
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

/** The bars take the bot's own color; an encoded shape or a picture is not a color. */
function useLevelColor(botColor: string): string {
  const tokens = useMobileTokens();
  const parsed = parseBotAvatarValue(botColor);
  return useAvatarFill(
    parsed.kind === "shape" || parsed.kind === "color" ? parsed.color : tokens.foreground,
  );
}

/**
 * The live call as plain text, newest at the bottom: the caller's words on the right in grey,
 * the bot's on the left, and the bottom edge fading out as Grok's does.
 */
function ScrollTranscript({ call }: { call: CallState }) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const scroll = useRef<ScrollView>(null);
  // Follow new words only while the caller has not scrolled back to read.
  const atEnd = useRef(true);
  const follow = () => {
    if (atEnd.current) scroll.current?.scrollToEnd({ animated: false });
  };
  return (
    <View style={styles.transcript}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.transcriptLines}
        onContentSizeChange={follow}
        onLayout={follow}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
        }}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={false}
      >
        {call.exchanges.map((exchange, index) => (
          <Text
            key={`${exchange.role}-${index + 1}`}
            style={[
              styles.turn,
              exchange.role === "user"
                ? { alignSelf: "flex-end", textAlign: "right", color: tokens.mutedForeground }
                : { alignSelf: "flex-start", color: tokens.foreground },
            ]}
          >
            {exchange.text}
          </Text>
        ))}
        {call.heard ? (
          <Text
            style={[
              styles.turn,
              { alignSelf: "flex-end", textAlign: "right", color: tokens.mutedForeground },
            ]}
          >
            {call.heard}
          </Text>
        ) : null}
        {call.caption ? (
          <Text style={[styles.caption, { color: tokens.mutedForeground }]}>{call.caption}</Text>
        ) : null}
        {call.micBlocked ? (
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
            <Text style={[styles.caption, { color: tokens.foreground }]}>{t("Open Settings")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View pointerEvents="none" style={styles.fade}>
        {FADE_STEPS.map((opacity) => (
          <View key={opacity} style={{ flex: 1, backgroundColor: tokens.background, opacity }} />
        ))}
      </View>
    </View>
  );
}

/** Bands from clear to the page color: a fade without a gradient library. */
const FADE_STEPS = [0.08, 0.16, 0.25, 0.34, 0.43, 0.52, 0.61, 0.7, 0.8, 0.9];

/** Voice, speed, and listening language for this call, inside the full call. */
function CallSettingsCard({ botId }: { botId: string }) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const preferences = useCallPreferences();
  const [voice, setVoice] = useState<CallVoice | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const voiceChoice = useRef(0);

  useEffect(() => {
    let current = true;
    setVoice(null);
    loadCallVoice(botId)
      .then((next) => {
        if (current) setVoice(next);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [botId]);

  const pickVoice = (key: string) => {
    if (!voice) return;
    const choice = ++voiceChoice.current;
    const before = voice;
    setVoice({ ...voice, value: key });
    setVoiceError("");
    voice.save(key).catch(() => {
      if (choice !== voiceChoice.current) return;
      setVoice(before);
      setVoiceError(t("Could not save that voice"));
    });
  };

  return (
    <View style={[styles.settingsCard, { backgroundColor: tokens.muted }]}>
      {voice && voice.choices.length > 0 ? (
        <MenuPicker
          label={t("Voice")}
          choices={voice.choices}
          value={voice.value}
          onChange={pickVoice}
        />
      ) : null}
      <MenuPicker
        divider={Boolean(voice?.choices.length)}
        label={t("Speed")}
        choices={CALL_SPEEDS.map((speed) => ({ key: String(speed), label: `${speed}x` }))}
        value={String(preferences.speed)}
        onChange={(key) => {
          const speed = CALL_SPEEDS.find((choice) => String(choice) === key);
          if (speed) setCallPreferences({ speed });
        }}
      />
      <MenuPicker
        divider
        label={t("Language")}
        choices={CALL_LANGUAGES.map((language) => ({
          key: language,
          label: language === "auto" ? t("Auto") : CALL_LANGUAGE_LABELS[language],
        }))}
        value={preferences.language}
        onChange={(key) => {
          const language = CALL_LANGUAGES.find((choice) => choice === key);
          if (language) setCallPreferences({ language });
        }}
      />
      {voiceError ? (
        <Text style={[styles.caption, styles.cardError, { color: tokens.mutedForeground }]}>
          {voiceError}
        </Text>
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
  selected,
  onPress,
}: {
  label: string;
  ios: string;
  android: ComponentProps<typeof NativeSymbol>["android"];
  size: number;
  color: string;
  background: string;
  border?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
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
  levels: {
    flex: 1,
    marginStart: 4,
    marginEnd: 6,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
  },
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
  settingsCard: { marginTop: 24, borderRadius: 14, overflow: "hidden" },
  transcript: { flex: 1, marginTop: 20, marginBottom: 20 },
  transcriptLines: { flexGrow: 1, justifyContent: "flex-end", gap: 14, paddingBottom: 6 },
  turn: { ...typeScale.body, maxWidth: "85%", paddingHorizontal: 4, writingDirection: "auto" },
  caption: { ...typeScale.secondary, textAlign: "center", writingDirection: "auto" },
  fade: { position: "absolute", start: 0, end: 0, bottom: 0, height: 40 },
  cardError: { paddingHorizontal: 16, paddingBottom: 12 },
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

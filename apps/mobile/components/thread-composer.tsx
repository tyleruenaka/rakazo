import type { MenuAction } from "@expo/ui/community/menu";
import { MenuView } from "@expo/ui/community/menu";
import type { AgentSkillCatalogEntry } from "@rakazo/contracts";
import type { buildComposerMentionOptions, ComposerMention, SlashActionId } from "@rakazo/core";
import {
  mentionChipKey,
  SLASH_ACTIONS,
  serializeComposerPrompt,
  truncateSlashDescription,
} from "@rakazo/core";
import type { Ref } from "react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as dictationEngine from "../lib/dictation";
import { getActiveUiLocale, useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import type { ComposerSnapshot } from "../lib/thread-feedback";
import { NativeSymbol } from "./native-symbol";

export type ComposerAttachment = { id: string; name: string; previewUri?: string };

/** Bars in the dictation level meter; the newest level is on the trailing end. */
const METER_BARS = 14;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function joinSpeech(left: string, right: string): string {
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

export type ThreadComposerHandle = {
  snapshot: () => ComposerSnapshot;
  reset: () => void;
};

type ThreadComposerProps = {
  ref: Ref<ThreadComposerHandle>;
  onFocus?: () => void;
  agentSkills: AgentSkillCatalogEntry[];
  composerMentionTargets: ReturnType<typeof buildComposerMentionOptions>;
  composerPrompt: string;
  replyTargetId?: string;
  replyQuote: string | null;
  attachments: ComposerAttachment[];
  removeAttachment: (id: string) => void;
  botId?: string;
  onCall: boolean;
  working: boolean;
  sending: boolean;
  attachActions: MenuAction[];
  attachFrom: (source: string) => void;
  send: () => Promise<void>;
  stop: () => Promise<void>;
  startVoiceCall: () => Promise<void>;
  onSlashAction: (action: SlashActionId) => void;
};

export function ThreadComposer({
  ref,
  onFocus,
  agentSkills,
  composerMentionTargets,
  composerPrompt,
  replyTargetId,
  replyQuote,
  attachments,
  removeAttachment,
  botId,
  onCall,
  working,
  sending,
  attachActions,
  attachFrom,
  send,
  stop,
  startVoiceCall,
  onSlashAction,
}: ThreadComposerProps) {
  const tokens = useMobileTokens();
  const colorScheme = useResolvedAppearance();
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<ComposerMention[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkillCatalogEntry | null>(null);
  const [dictation, setDictation] = useState<{ startedAt: number; levels: number[] } | null>(null);
  const [now, setNow] = useState(Date.now);
  /** Bumped on every start and stop, so a stale recognizer callback can tell it is stale. */
  const dictationRun = useRef(0);
  const listening = useRef(false);
  const attachmentIds = attachments.map((attachment) => attachment.id);
  const dictating = dictation !== null;
  useEffect(() => {
    if (!dictating) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [dictating]);
  // Leaving the thread mid-dictation releases the microphone.
  useEffect(
    () => () => {
      if (listening.current) dictationEngine.stop();
    },
    [],
  );
  useImperativeHandle(ref, () => ({
    snapshot: () => ({
      promptText: serializeComposerPrompt(draft, selectedSkill, selectedMentions),
      mentions: selectedMentions,
      skill: selectedSkill,
      replyTargetId,
      replyQuote,
      attachmentIds,
    }),
    reset: () => {
      setDraft("");
      setMentionQuery(null);
      setSlashQuery(null);
      setSelectedSkill(null);
      setSelectedMentions([]);
    },
  }));
  const mentionOptions = useMemo(() => {
    if (mentionQuery === null || composerMentionTargets.length === 0) return [];
    const query = mentionQuery.trim().toLowerCase();
    return composerMentionTargets
      .filter((target) => !query || target.name.toLowerCase().startsWith(query))
      .slice(0, 10);
  }, [composerMentionTargets, mentionQuery]);
  const slashQueryNormalized = slashQuery?.trim().toLowerCase() ?? null;
  const slashSkillOptions =
    slashQuery !== null && mentionQuery === null
      ? agentSkills
          .filter((skill) => {
            if (!slashQueryNormalized) return true;
            return (
              skill.name.toLowerCase().includes(slashQueryNormalized) ||
              skill.description.toLowerCase().includes(slashQueryNormalized)
            );
          })
          .slice(0, 8)
      : [];
  const slashActionOptions =
    slashQuery !== null && mentionQuery === null
      ? SLASH_ACTIONS.filter((action) => {
          if (!slashQueryNormalized) return true;
          const label = t(action.label);
          return (
            action.label.toLowerCase().includes(slashQueryNormalized) ||
            label.toLowerCase().includes(slashQueryNormalized)
          );
        })
      : [];
  function updateDraft(value: string) {
    setDraft(value);
    const match = /(?:^|\s)@([\w-]*)$/.exec(value);
    setMentionQuery(match ? (match[1] ?? "") : null);
    const slashMatch = selectedSkill === null ? /^\/([^\n]*)$/.exec(value) : null;
    setSlashQuery(slashMatch ? (slashMatch[1] ?? "") : null);
  }

  function insertMention(mention: ComposerMention) {
    setDraft((current) => current.replace(/@([\w-]*)$/, ""));
    setMentionQuery(null);
    setSelectedMentions((current) =>
      current.some((selected) => mentionChipKey(selected) === mentionChipKey(mention))
        ? current
        : [...current, mention],
    );
  }

  function insertSkill(skill: AgentSkillCatalogEntry) {
    setSelectedSkill(skill);
    setDraft("");
    setSlashQuery(null);
  }

  function removeLastChip() {
    if (selectedMentions.length > 0) {
      setSelectedMentions((current) => current.slice(0, -1));
      return;
    }
    if (selectedSkill) setSelectedSkill(null);
  }

  /** On-device dictation into the draft until stopped; each spoken turn appends to it. */
  function startDictation() {
    dictationRun.current += 1;
    listening.current = true;
    const run = dictationRun.current;
    let carried = draft;
    const startedAt = Date.now();
    setNow(startedAt);
    setDictation({ startedAt, levels: [] });
    const listenOnce = () => {
      if (run !== dictationRun.current) return;
      void dictationEngine.listen({
        lang: getActiveUiLocale(),
        onInterim: (text) => {
          if (run === dictationRun.current) updateDraft(joinSpeech(carried, text));
        },
        onFinal: (text) => {
          if (run !== dictationRun.current) return;
          // Empty after a long quiet stretch: keep listening.
          if (text) {
            carried = joinSpeech(carried, text);
            updateDraft(carried);
          }
          listenOnce();
        },
        onError: (code) => {
          if (run !== dictationRun.current) return;
          stopDictation();
          // iOS reports any failed start as "not-allowed", so ask what the permission really is.
          void dictationEngine.access().then((access) => {
            if (access === "denied") askForMicrophone();
            else
              Alert.alert(
                t("Dictation stopped"),
                code === "audio-capture"
                  ? t("Could not hear that.")
                  : t("Speech recognition is not available."),
              );
          });
        },
        onVolume: (value) => {
          if (run !== dictationRun.current) return;
          setDictation((current) =>
            current
              ? { ...current, levels: [...current.levels, value].slice(-METER_BARS) }
              : current,
          );
        },
      });
    };
    void dictationEngine.access().then((access) => {
      if (run !== dictationRun.current) return;
      if (access === "granted") {
        listenOnce();
        return;
      }
      stopDictation();
      if (access === "denied") askForMicrophone();
      else Alert.alert(t("Dictation stopped"), t("Speech recognition is not available."));
    });
  }

  function askForMicrophone() {
    Alert.alert(
      t("Microphone is off"),
      t("Turn on the microphone and speech recognition for Rakazo in Settings."),
      [
        { text: t("Not now"), style: "cancel" },
        { text: t("Open Settings"), onPress: () => void Linking.openSettings() },
      ],
    );
  }

  function stopDictation() {
    dictationRun.current += 1;
    if (listening.current) dictationEngine.stop();
    listening.current = false;
    setDictation(null);
  }

  function runSlashAction(action: SlashActionId) {
    setDraft("");
    setSlashQuery(null);
    onSlashAction(action);
  }

  const fieldStyle = {
    backgroundColor: tokens.muted,
    borderColor: tokens.composerControlBorder,
  };

  const canSend =
    Boolean(draft.trim()) ||
    selectedSkill !== null ||
    selectedMentions.length > 0 ||
    attachmentIds.length > 0;

  return (
    <>
      {mentionOptions.length ? (
        <ScrollView
          testID="mention-picker"
          keyboardShouldPersistTaps="handled"
          style={{
            flexGrow: 0,
            flexShrink: 1,
            marginTop: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: tokens.border,
            backgroundColor: tokens.card,
            overflow: "hidden",
          }}
        >
          {mentionOptions.map((mention) => (
            <Pressable
              key={mentionChipKey(mention)}
              accessibilityLabel={t("@{name}", { name: mention.name })}
              onPress={() => insertMention(mention)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <MentionOptionIcon mention={mention} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: tokens.foreground, fontSize: 14 }}>@{mention.name}</Text>
                {mention.subtitle ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: tokens.mutedForeground,
                      fontSize: 12.5,
                      marginTop: 2,
                    }}
                  >
                    {mention.subtitle}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {slashSkillOptions.length || slashActionOptions.length ? (
        <ScrollView
          testID="slash-picker"
          keyboardShouldPersistTaps="handled"
          style={{
            flexGrow: 0,
            flexShrink: 1,
            marginTop: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: tokens.border,
            backgroundColor: tokens.card,
            overflow: "hidden",
          }}
        >
          {slashSkillOptions.map((skill) => (
            <Pressable
              key={skill.id}
              accessibilityLabel={t("Skill {name}", { name: skill.name })}
              onPress={() => insertSkill(skill)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <NativeSymbol
                ios="cube"
                android="cube-outline"
                size={16}
                color={tokens.mutedForeground}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: tokens.foreground, fontSize: 14 }}>{skill.name}</Text>
                <Text
                  numberOfLines={1}
                  style={{ color: tokens.mutedForeground, fontSize: 12.5, marginTop: 2 }}
                >
                  {truncateSlashDescription(skill.description)}
                </Text>
              </View>
            </Pressable>
          ))}
          {slashActionOptions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityLabel={t(action.label)}
              onPress={() => runSlashAction(action.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <NativeSymbol
                ios="gearshape"
                android="settings-outline"
                size={16}
                color={tokens.mutedForeground}
              />
              <Text style={{ color: tokens.foreground, fontSize: 14 }}>{t(action.label)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {dictation ? (
        <View style={composerStyles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Stop dictation")}
            onPress={stopDictation}
            style={[composerStyles.dictationSide, fieldStyle]}
          >
            <View style={[composerStyles.stopSquare, { backgroundColor: tokens.foreground }]} />
          </Pressable>
          <View style={[composerStyles.dictationMiddle, fieldStyle]}>
            <Text style={[composerStyles.timer, { color: tokens.foreground }]}>
              {clock(Math.floor((now - dictation.startedAt) / 1000))}
            </Text>
            <LevelMeter levels={dictation.levels} color={tokens.composerIcon} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Send")}
            disabled={sending}
            onPress={() => {
              stopDictation();
              if (canSend) void send();
            }}
            style={[
              composerStyles.dictationSide,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.primary,
                opacity: sending ? 0.5 : 1,
              },
            ]}
          >
            <NativeSymbol
              ios="arrow.up"
              android="arrow-up"
              size={20}
              color={tokens.primaryForeground}
            />
          </Pressable>
        </View>
      ) : (
        <View style={composerStyles.row}>
          <MenuView
            actions={attachActions}
            colorScheme={colorScheme}
            onPressAction={(event) => attachFrom(event.nativeEvent.event)}
          >
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("Attach file")}
              style={[composerStyles.plus, fieldStyle]}
            >
              <NativeSymbol ios="plus" android="add" size={20} color={tokens.foreground} />
            </View>
          </MenuView>
          <View
            style={[
              composerStyles.field,
              fieldStyle,
              // With an attachment the field steps back below the page, as a tray.
              attachments.length ? { backgroundColor: tokens.background } : null,
            ]}
          >
            {attachments.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={composerStyles.attachments}
              >
                {attachments.map((attachment) => (
                  <View key={attachment.id}>
                    {attachment.previewUri ? (
                      <Image
                        source={{ uri: attachment.previewUri }}
                        style={composerStyles.thumbnail}
                      />
                    ) : (
                      <View
                        style={[
                          composerStyles.thumbnail,
                          composerStyles.fileTile,
                          { backgroundColor: tokens.attachment },
                        ]}
                      >
                        <NativeSymbol
                          ios="doc"
                          android="document-outline"
                          size={22}
                          color={tokens.mutedForeground}
                        />
                        <Text
                          numberOfLines={2}
                          style={[composerStyles.fileName, { color: tokens.foreground }]}
                        >
                          {attachment.name}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityLabel={t("Remove {name}", { name: attachment.name })}
                      hitSlop={8}
                      onPress={() => removeAttachment(attachment.id)}
                      style={[composerStyles.removeBadge, { backgroundColor: tokens.primary }]}
                    >
                      <NativeSymbol
                        ios="xmark"
                        android="close"
                        size={11}
                        color={tokens.primaryForeground}
                      />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={composerStyles.inputRow}>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {selectedSkill ? (
                  <View
                    testID="skill-chip"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: tokens.muted,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      maxWidth: "100%",
                    }}
                  >
                    <NativeSymbol
                      ios="cube"
                      android="cube-outline"
                      size={13}
                      color={tokens.mutedForeground}
                    />
                    <Text
                      numberOfLines={1}
                      style={{ color: tokens.foreground, fontSize: 13, flexShrink: 1 }}
                    >
                      {selectedSkill.name}
                    </Text>
                    <Pressable
                      accessibilityLabel={t("Remove skill {name}", { name: selectedSkill.name })}
                      hitSlop={8}
                      onPress={() => setSelectedSkill(null)}
                    >
                      <NativeSymbol
                        ios="xmark"
                        android="close"
                        size={12}
                        color={tokens.mutedForeground}
                      />
                    </Pressable>
                  </View>
                ) : null}
                {selectedMentions.map((mention) => (
                  <View
                    key={mentionChipKey(mention)}
                    testID="mention-chip"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: tokens.muted,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      maxWidth: "100%",
                    }}
                  >
                    <MentionChipIcon mention={mention} />
                    <Text
                      numberOfLines={1}
                      style={{ color: tokens.foreground, fontSize: 13, flexShrink: 1 }}
                    >
                      {mention.name}
                    </Text>
                    <Pressable
                      accessibilityLabel={t("Remove mention {name}", { name: mention.name })}
                      hitSlop={8}
                      onPress={() =>
                        setSelectedMentions((current) =>
                          current.filter(
                            (selected) => mentionChipKey(selected) !== mentionChipKey(mention),
                          ),
                        )
                      }
                    >
                      <NativeSymbol
                        ios="xmark"
                        android="close"
                        size={12}
                        color={tokens.mutedForeground}
                      />
                    </Pressable>
                  </View>
                ))}
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 96 }}>
                  {!draft && !selectedSkill && !selectedMentions.length ? (
                    <Text
                      numberOfLines={1}
                      importantForAccessibility="no"
                      accessibilityElementsHidden
                      accessible={false}
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 12,
                        start: 0,
                        end: 0,
                        fontSize: 17,
                        lineHeight: 22,
                        color: tokens.chatPlaceholder,
                      }}
                    >
                      {composerPrompt}
                    </Text>
                  ) : null}
                  <TextInput
                    onFocus={onFocus}
                    value={draft}
                    onChangeText={updateDraft}
                    accessibilityLabel={composerPrompt}
                    onKeyPress={(event) => {
                      if (
                        event.nativeEvent.key === "Backspace" &&
                        draft.length === 0 &&
                        (selectedSkill !== null || selectedMentions.length > 0)
                      ) {
                        removeLastChip();
                      }
                    }}
                    keyboardAppearance={colorScheme}
                    autoCapitalize="none"
                    multiline
                    textAlignVertical="top"
                    blurOnSubmit={false}
                    style={{
                      color: tokens.foreground,
                      fontSize: 17,
                      lineHeight: 22,
                      paddingTop: 12,
                      paddingBottom: 12,
                      maxHeight: 132,
                      writingDirection: "auto",
                    }}
                  />
                </View>
              </View>
              {!onCall ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Dictate")}
                  hitSlop={{ top: 8, bottom: 8 }}
                  onPress={startDictation}
                  style={composerStyles.mic}
                >
                  <NativeSymbol
                    ios="mic.fill"
                    android="mic"
                    size={20}
                    color={tokens.composerIcon}
                  />
                </Pressable>
              ) : null}
              {canSend ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Send")}
                  disabled={sending}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  onPress={() => void send()}
                  style={[
                    composerStyles.pill,
                    { backgroundColor: tokens.primary, opacity: sending ? 0.5 : 1 },
                  ]}
                >
                  <NativeSymbol
                    ios="arrow.up"
                    android="arrow-up"
                    size={17}
                    color={tokens.primaryForeground}
                  />
                </Pressable>
              ) : working ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Stop")}
                  disabled={sending}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  onPress={() => void stop()}
                  style={[
                    composerStyles.pill,
                    { backgroundColor: tokens.primary, opacity: sending ? 0.5 : 1 },
                  ]}
                >
                  <View
                    style={[composerStyles.pillStop, { backgroundColor: tokens.primaryForeground }]}
                  />
                </Pressable>
              ) : botId && !onCall ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Call")}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  onPress={() => void startVoiceCall()}
                  style={[composerStyles.pill, { backgroundColor: tokens.primary }]}
                >
                  <VoiceGlyph color={tokens.primaryForeground} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      )}
    </>
  );
}

/** Five rounded bars, tallest second and fourth: the call control's mark. */
function VoiceGlyph({ color }: { color: string }) {
  return (
    <View accessible={false} style={composerStyles.voiceGlyph}>
      {[7, 15, 9, 15, 7].map((height, index) => (
        <View
          key={`voice-${index + 1}`}
          style={{ width: 2, height, borderRadius: 1, backgroundColor: color }}
        />
      ))}
    </View>
  );
}

/** Recent input levels as thin bars; a quiet level is a dot. */
function LevelMeter({ levels, color }: { levels: number[]; color: string }) {
  const padded = [...Array<number>(Math.max(0, METER_BARS - levels.length)).fill(-2), ...levels];
  return (
    <View accessible={false} style={composerStyles.meter}>
      {padded.map((level, index) => (
        <View
          key={index}
          style={{
            width: 2,
            height: Math.max(2.5, Math.min(18, ((level + 2) / 12) * 18)),
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

const composerStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 8 },
  plus: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  field: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    // Keeps text clear of the mic and pill even when it runs to the trailing edge (RTL).
    gap: 8,
    paddingStart: 15,
    paddingEnd: 7,
  },
  mic: { height: 46, width: 24, alignItems: "center", justifyContent: "center", marginEnd: 5 },
  pill: {
    width: 40,
    height: 32,
    borderRadius: 16,
    marginBottom: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceGlyph: { flexDirection: "row", alignItems: "center", gap: 1.3 },
  pillStop: { width: 11, height: 11, borderRadius: 2 },
  attachments: { gap: 8, paddingHorizontal: 9, paddingTop: 9 },
  thumbnail: { width: 88, height: 88, borderRadius: 14 },
  fileTile: { padding: 10, gap: 6, justifyContent: "space-between" },
  fileName: { fontSize: 12, lineHeight: 15 },
  removeBadge: {
    position: "absolute",
    top: 5,
    end: 5,
    width: 21,
    height: 21,
    borderRadius: 10.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dictationSide: {
    width: 95,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dictationMiddle: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  stopSquare: { width: 16, height: 16, borderRadius: 3 },
  timer: { fontSize: 21, fontWeight: "600", fontVariant: ["tabular-nums"] },
  meter: { flexDirection: "row", alignItems: "center", gap: 2, height: 18 },
});

function MentionOptionIcon({ mention }: { mention: ComposerMention }) {
  const tokens = useMobileTokens();
  if (mention.kind === "routine") {
    return (
      <NativeSymbol ios="clock" android="time-outline" size={16} color={tokens.mutedForeground} />
    );
  }
  if (mention.kind === "connector") {
    return (
      <NativeSymbol
        ios="puzzlepiece.extension"
        android="extension-puzzle-outline"
        size={16}
        color={tokens.mutedForeground}
      />
    );
  }
  if (mention.kind === "group") {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: tokens.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: tokens.foreground, fontSize: 9 }}>G</Text>
      </View>
    );
  }
  if (mention.kind === "everyone") {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: tokens.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: tokens.foreground, fontSize: 9 }}>@</Text>
      </View>
    );
  }
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        backgroundColor: mention.color ?? tokens.mutedForeground,
      }}
    />
  );
}

function MentionChipIcon({ mention }: { mention: ComposerMention }) {
  const tokens = useMobileTokens();
  if (mention.kind === "routine") {
    return (
      <NativeSymbol ios="clock" android="time-outline" size={13} color={tokens.mutedForeground} />
    );
  }
  if (mention.kind === "connector") {
    return (
      <NativeSymbol
        ios="puzzlepiece.extension"
        android="extension-puzzle-outline"
        size={13}
        color={tokens.mutedForeground}
      />
    );
  }
  if (mention.kind === "group" || mention.kind === "everyone") {
    return (
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: tokens.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: tokens.foreground, fontSize: 9 }}>
          {mention.kind === "group" ? "G" : "@"}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        width: 14,
        height: 14,
        borderRadius: 4,
        backgroundColor: mention.color ?? tokens.mutedForeground,
      }}
    />
  );
}

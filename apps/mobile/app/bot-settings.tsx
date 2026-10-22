import type { ComputerMode, ThinkingLevel } from "@rakazo/contracts";
import {
  BOT_COLORS,
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_INSTRUCTIONS_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  normalizeCreateBotProfile,
} from "@rakazo/contracts";
import {
  credentialForModel,
  MODEL_SEARCH_THRESHOLD,
  modelOptionKey,
  parseModelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { Voice } from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BotAvatar } from "../components/bot-avatar";
import { BotCard, BotCardLabel, BotCardRow } from "../components/bot-card";
import { ComputerModePicker } from "../components/computer-mode-picker";
import { floatingHeaderOptions } from "../components/glass-title";
import { InfoButton } from "../components/info-button";
import type { MenuPickerChoice } from "../components/menu-picker";
import { MenuPicker, MenuPickerMenu } from "../components/menu-picker";
import { NativeSwitch } from "../components/native-switch";
import { NativeSymbol } from "../components/native-symbol";
import { Chevron } from "../components/row-accessories";
import { trailingHeaderOptions } from "../components/sheet-header";
import type { MobileBot, MobileMe, MobileModel, MobileModelCredential } from "../lib/api";
import { rpc } from "../lib/api";
import { botSwitchTint } from "../lib/bot-avatar-edit";
import { deviceVoices, setVoiceForBot, voiceForBot, voiceLabel } from "../lib/bot-voices";
import { chatModelPickerChoices } from "../lib/chat-model";
import { COMPUTER_LIFECYCLE_TIMEOUT_MS } from "../lib/computer";
import { loadDeviceVoiceEnabled } from "../lib/device-voice";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { createQueuedSave } from "../lib/queued-save";
import { errorText } from "../lib/user-error";
import { stopVoicePlayback } from "../lib/voice";

type BotSettingsRecord = MobileBot & {
  description?: string;
};

export default function BotSettingsScreen() {
  const tokens = useMobileTokens();
  const fieldStyle = [styles.field, { color: native.label }];
  const { t } = useI18n();
  const router = useRouter();
  const {
    botId,
    model: pickedModel,
    avatar: pickedAvatar,
  } = useLocalSearchParams<{ botId: string; model?: string; avatar?: string }>();
  const [bot, setBot] = useState<BotSettingsRecord | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [color, setColor] = useState<string>(BOT_COLORS[0]);
  const [computerMode, setComputerMode] = useState<ComputerMode>("team");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelKey, setModelKey] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [fleetManagement, setFleetManagement] = useState(false);
  const [credentials, setCredentials] = useState<MobileModelCredential[]>([]);
  const [catalog, setCatalog] = useState<MobileModel[]>([]);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [modelMetaReady, setModelMetaReady] = useState(false);
  const [modelMetaError, setModelMetaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceVoiceEnabled, setDeviceVoiceEnabled] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const savedVoiceId = useRef<string | undefined>(undefined);
  const voiceChoice = useRef(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fleetSave = useMemo(
    () =>
      createQueuedSave<boolean>(false, {
        save: async (value) => {
          await rpc("bots/update", { botId, fleetManagement: value });
        },
        onChange: setFleetManagement,
        onError: (err) => setError(errorText(err, t("Could not save bot"))),
      }),
    [botId, t],
  );

  useEffect(() => {
    if (!botId) return;
    void rpc<BotSettingsRecord>("bots/get", { botId })
      .then((next) => {
        setBot(next);
        setName(next.name);
        setTitle(next.title);
        setDescription(next.description ?? "");
        setInstructions(next.instructions ?? "");
        setColor(next.color);
        setComputerMode(next.computerMode);
        setModelKey(
          next.modelProvider && next.modelId
            ? modelOptionKey(next.modelProvider, next.modelId)
            : "",
        );
        setThinkingLevel(next.thinkingLevel ?? "");
        setAutoSpeak(next.autoSpeak);
        setFleetManagement(next.fleetManagement);
        fleetSave.reset(next.fleetManagement);
      })
      .catch((err) => setError(errorText(err, t("Could not load bot"))));
  }, [botId, fleetSave]);

  useEffect(() => {
    void Promise.all([
      rpc<MobileMe>("me"),
      rpc<MobileModel[]>("models/list"),
      rpc<MobileModelCredential[]>("models/credentials"),
    ])
      .then(([nextMe, nextCatalog, nextCredentials]) => {
        setMe(nextMe);
        setCatalog(nextCatalog);
        setCredentials(nextCredentials);
        setModelMetaError(null);
        setModelMetaReady(true);
      })
      .catch((err) => {
        setModelMetaReady(false);
        setModelMetaError(errorText(err, t("Could not load model settings")));
      });
  }, [t]);

  const storedModel = modelKey ? parseModelOptionKey(modelKey) : null;
  const selectedModel = storedModel
    ? {
        provider: storedModel.provider,
        modelId: resolveSelectableModelId(catalog, storedModel.provider, storedModel.modelId),
      }
    : null;
  const selectedModelKey = selectedModel
    ? modelOptionKey(selectedModel.provider, selectedModel.modelId)
    : "";

  const effectiveProvider = selectedModel?.provider ?? me?.defaultProvider ?? null;
  const effectiveModelId = selectedModel?.modelId ?? me?.defaultModel ?? null;
  const effectiveEntry =
    effectiveProvider && effectiveModelId
      ? catalog.find(
          (entry) =>
            entry.provider === effectiveProvider &&
            resolveSelectableModelId(catalog, entry.provider, entry.id) === effectiveModelId,
        )
      : undefined;
  const effectiveCredential = credentialForModel(credentials, effectiveProvider, effectiveModelId);
  const thinkingOptions = (
    effectiveCredential?.thinkingLevels ??
    effectiveEntry?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");

  const modelChoices = useMemo(
    () => chatModelPickerChoices(me, catalog, credentials, selectedModelKey, t),
    [catalog, credentials, me, selectedModelKey, t],
  );

  const thinkingChoices: MenuPickerChoice[] = useMemo(
    () => [
      { key: "", label: t("Default (medium)") },
      ...thinkingOptions.map((level) => ({
        key: level,
        label: thinkingLevelLabel(level, t),
      })),
    ],
    [t, thinkingOptions],
  );

  function selectModel(key: string) {
    if (key === selectedModelKey) return;
    setModelKey(key);
    setThinkingLevel("");
  }

  // The searchable model list hands its pick back as a one-shot route param.
  useEffect(() => {
    if (pickedModel === undefined) return;
    router.setParams({ model: undefined });
    selectModel(pickedModel);
  }, [pickedModel]);

  // The Avatar editor hands its pick back the same way; Done saves it with the rest.
  useEffect(() => {
    if (pickedAvatar === undefined) return;
    router.setParams({ avatar: undefined });
    setColor(pickedAvatar);
  }, [pickedAvatar]);

  function applyVoices(available: Voice[], assigned: string | undefined) {
    setVoices(available);
    savedVoiceId.current = assigned;
    setVoiceId(assigned);
    setVoiceError(null);
  }

  function failVoices() {
    setVoices([]);
    setVoiceError(t("Could not load voices"));
  }

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void loadDeviceVoiceEnabled()
        .then((enabled) => {
          if (current) setDeviceVoiceEnabled(enabled);
        })
        .catch(() => {
          if (current) setDeviceVoiceEnabled(false);
        });
      return () => {
        current = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!botId || !deviceVoiceEnabled) return;
    let current = true;
    void Promise.all([deviceVoices(), voiceForBot(botId)])
      .then(([available, assigned]) => {
        if (!current) return;
        applyVoices(available, assigned);
      })
      .catch(() => {
        if (!current) return;
        failVoices();
      });
    return () => {
      current = false;
    };
  }, [botId, deviceVoiceEnabled, t]);

  async function chooseVoice(voice: Voice) {
    if (!botId) return;
    // Picking a voice cuts off a reply in progress before the sample starts.
    stopVoicePlayback();
    const choice = ++voiceChoice.current;
    setVoiceId(voice.identifier);
    setError(null);
    try {
      await setVoiceForBot(botId, voice.identifier);
      savedVoiceId.current = voice.identifier;
    } catch {
      if (choice !== voiceChoice.current) return;
      setVoiceId(savedVoiceId.current);
      setError(t("Could not save that voice"));
      return;
    }
    if (choice !== voiceChoice.current) return;
    try {
      const Speech = await import("expo-speech");
      if (choice !== voiceChoice.current) return;
      await Speech.stop();
      if (choice !== voiceChoice.current) return;
      const sampleName = name.trim();
      Speech.speak(
        sampleName ? t("Hi, I'm {name}.", { name: sampleName }) : t("Hi, this is how I'll sound."),
        { voice: voice.identifier },
      );
    } catch {
      // The choice is already saved. A sample that cannot play is not a failed save.
    }
  }

  const currentVoice = voices.find((voice) => voice.identifier === voiceId);
  const currentVoiceLabel = currentVoice ? voiceLabel(currentVoice) : t("Default");

  async function retryDeviceVoices() {
    if (!botId) return;
    try {
      const [available, assigned] = await Promise.all([deviceVoices(), voiceForBot(botId)]);
      applyVoices(available, assigned);
    } catch {
      failVoices();
    }
  }

  async function save() {
    if (!botId || !bot || pending) return;
    setPending(true);
    setError(null);
    try {
      const profile = normalizeCreateBotProfile({ name, title, description });
      const selected = selectedModel;
      const input: {
        botId: string;
        name?: string;
        title?: string;
        description?: string;
        instructions?: string;
        expectedInstructions?: string;
        color?: string;
        modelProvider?: string | null;
        modelId?: string | null;
        thinkingLevel?: ThinkingLevel | null;
        autoSpeak?: boolean;
      } = { botId };
      if (profile.name !== bot.name) input.name = profile.name;
      if (profile.title !== bot.title) input.title = profile.title;
      if (profile.description !== (bot.description ?? "")) {
        input.description = profile.description;
      }
      if (instructions !== bot.instructions) {
        input.instructions = instructions;
        input.expectedInstructions = bot.instructions;
      }
      if (color !== bot.color) input.color = color;
      const modelChanged =
        (selected?.provider ?? null) !== (bot.modelProvider ?? null) ||
        (selected?.modelId ?? null) !== (bot.modelId ?? null);
      const thinkingChanged = (thinkingLevel || null) !== (bot.thinkingLevel ?? null);
      if (modelChanged) {
        input.modelProvider = selected?.provider ?? null;
        input.modelId = selected?.modelId ?? null;
      }
      if (modelMetaReady && (modelChanged || thinkingChanged)) {
        input.thinkingLevel = thinkingOptions.length
          ? ((thinkingLevel || null) as ThinkingLevel | null)
          : null;
      }
      if (autoSpeak !== bot.autoSpeak) input.autoSpeak = autoSpeak;
      if (computerMode !== bot.computerMode) {
        await rpc(
          "bots/setComputer",
          { botId, mode: computerMode },
          { timeoutMs: COMPUTER_LIFECYCLE_TIMEOUT_MS },
        );
        setBot((prev) => (prev ? { ...prev, computerMode } : prev));
      }
      // Use key presence so clearing title/description to "" still persists.
      if (Object.keys(input).length > 1) {
        const updated = await rpc<BotSettingsRecord | undefined>("bots/update", input);
        // Saved edits and their history become the baseline, so a retry after a failed switch write
        // does not resend them.
        const { botId: _botId, expectedInstructions: _expected, ...saved } = input;
        setBot((prev) => (prev ? { ...prev, ...saved, ...updated } : prev));
      }
      await fleetSave.flush();
      router.back();
    } catch (err) {
      setError(errorText(err, t("Could not save bot")));
    } finally {
      setPending(false);
    }
  }

  const voiceValue = (
    <Text
      numberOfLines={1}
      style={[styles.rowValue, voiceError ? { color: tokens.destructive } : null]}
    >
      {voiceError ?? currentVoiceLabel}
    </Text>
  );
  const hasVoiceMenu = !voiceError && voices.length > 1;
  const voiceRowContent = (
    <View
      accessibilityLabel={hasVoiceMenu ? t("Device voice") : undefined}
      accessibilityRole={hasVoiceMenu ? "button" : undefined}
      accessibilityValue={hasVoiceMenu ? { text: currentVoiceLabel } : undefined}
      accessible={hasVoiceMenu}
      style={styles.cardRow}
    >
      <Text style={styles.rowLabel}>{t("Device voice")}</Text>
      {voiceValue}
      {hasVoiceMenu ? (
        <NativeSymbol
          android="chevron-expand"
          color={native.secondaryLabel}
          ios="chevron.up.chevron.down"
          size={14}
        />
      ) : null}
    </View>
  );
  const voiceRow = hasVoiceMenu ? (
    <MenuPickerMenu
      choices={voices.map((voice) => ({ key: voice.identifier, label: voiceLabel(voice) }))}
      label={t("Device voice")}
      onChange={(key) => {
        const voice = voices.find((candidate) => candidate.identifier === key);
        if (voice) void chooseVoice(voice);
      }}
      value={voiceId ?? ""}
    >
      {voiceRowContent}
    </MenuPickerMenu>
  ) : (
    voiceRowContent
  );

  const editAvatar = () =>
    router.push({ pathname: "/bot-avatar", params: { botId, value: color } });
  const dirty =
    !!bot &&
    (name !== bot.name ||
      title !== bot.title ||
      description !== (bot.description ?? "") ||
      instructions !== (bot.instructions ?? "") ||
      color !== bot.color ||
      computerMode !== bot.computerMode ||
      autoSpeak !== bot.autoSpeak ||
      fleetManagement !== bot.fleetManagement ||
      thinkingLevel !== (bot.thinkingLevel ?? "") ||
      (selectedModel?.provider ?? null) !== (bot.modelProvider ?? null) ||
      (selectedModel?.modelId ?? null) !== (bot.modelId ?? null));

  return (
    <>
      <Stack.Screen
        options={{
          ...floatingHeaderOptions(),
          headerTitle: undefined,
          title: t("Edit Bot"),
          headerTitleStyle: { fontWeight: "400" },
          ...trailingHeaderOptions(
            pending ? t("Saving…") : t("Done"),
            () => void save(),
            !dirty || !name.trim() || pending,
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.card }}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.avatar}>
          {bot ? (
            <Pressable
              accessibilityLabel={t("Avatar")}
              accessibilityRole="button"
              onPress={editAvatar}
            >
              <BotAvatar color={color} identity={bot.id} size={96} status={bot.status} />
              <View
                style={[
                  styles.avatarBadge,
                  { backgroundColor: tokens.card, borderColor: tokens.popoverBorder },
                ]}
              >
                <NativeSymbol android="pencil" color={native.label} ios="pencil" size={18} />
              </View>
            </Pressable>
          ) : (
            <View style={styles.avatarSpace} />
          )}
        </View>
        <View style={styles.firstSection}>
          <BotCardLabel>{t("Name")}</BotCardLabel>
          <BotCard>
            <TextInput
              key="name"
              accessibilityLabel={t("Name")}
              value={name}
              maxLength={BOT_NAME_MAX_LENGTH}
              onChangeText={setName}
              placeholder={t("Name this bot")}
              placeholderTextColor={native.secondaryLabel}
              style={fieldStyle}
            />
          </BotCard>
        </View>
        <View style={styles.section}>
          <BotCardLabel>{t("Title")}</BotCardLabel>
          <BotCard>
            <TextInput
              key="title"
              accessibilityLabel={t("Title")}
              value={title}
              maxLength={BOT_TITLE_MAX_LENGTH}
              onChangeText={setTitle}
              placeholder={t("Describe what this bot does")}
              placeholderTextColor={native.secondaryLabel}
              style={fieldStyle}
            />
          </BotCard>
        </View>
        {bot ? (
          <View style={styles.section}>
            <BotCardLabel>{t("Appearance")}</BotCardLabel>
            <BotCard>
              <BotCardRow key="avatar" title={t("Avatar")} onPress={editAvatar} />
            </BotCard>
          </View>
        ) : null}
        <View style={styles.section}>
          <BotCardLabel>{t("Voice")}</BotCardLabel>
          <BotCard separatorInset={18}>
            {deviceVoiceEnabled ? (
              voiceError ? (
                <Pressable
                  key="voice"
                  accessibilityRole="button"
                  accessibilityLabel={t("Device voice")}
                  accessibilityValue={{ text: voiceError }}
                  onPress={() => void retryDeviceVoices()}
                >
                  {voiceRow}
                </Pressable>
              ) : (
                <View key="voice">{voiceRow}</View>
              )
            ) : null}
            <View key="speak" style={styles.cardRow}>
              <Text style={styles.rowLabel}>{t("Read replies aloud")}</Text>
              <NativeSwitch
                accessibilityLabel={t("Read replies aloud")}
                onValueChange={setAutoSpeak}
                tintColor={botSwitchTint(color)}
                value={autoSpeak}
              />
            </View>
          </BotCard>
        </View>
        <View style={styles.section}>
          <BotCard>
            <Pressable
              key="advanced"
              accessibilityRole="button"
              accessibilityLabel={t("Advanced")}
              accessibilityState={{ expanded: advancedOpen }}
              onPress={() => setAdvancedOpen((open) => !open)}
              style={styles.cardRow}
            >
              <Text style={styles.rowLabel}>{t("Advanced")}</Text>
              <Chevron expanded={advancedOpen} />
            </Pressable>
          </BotCard>
        </View>
        {advancedOpen ? (
          <View style={{ gap: 16, paddingTop: 16 }}>
            <View>
              <BotCardLabel>{t("Description")}</BotCardLabel>
              <BotCard>
                <TextInput
                  key="description"
                  accessibilityLabel={t("Description")}
                  value={description}
                  maxLength={BOT_DESCRIPTION_MAX_LENGTH}
                  onChangeText={setDescription}
                  placeholder={t("What this bot is for")}
                  placeholderTextColor={native.secondaryLabel}
                  multiline
                  style={[fieldStyle, styles.multilineField]}
                />
              </BotCard>
            </View>
            <View>
              <BotCardLabel>{t("Instructions")}</BotCardLabel>
              <BotCard>
                <TextInput
                  key="instructions"
                  accessibilityLabel={t("Instructions")}
                  multiline
                  maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
                  value={instructions}
                  onChangeText={setInstructions}
                  style={[fieldStyle, styles.multilineField]}
                />
              </BotCard>
              {bot?.instructionHistory?.length && instructions === bot.instructions ? (
                <MenuPicker
                  plain
                  label={t("Instruction history")}
                  value=""
                  choices={bot.instructionHistory.map((version) => ({
                    key: version.id,
                    label: `${new Date(version.createdAt).toLocaleString()} · ${version.reason}`,
                  }))}
                  onChange={(versionId) => {
                    if (pending || instructions !== bot.instructions) return;
                    const version = bot.instructionHistory?.find((item) => item.id === versionId);
                    if (version)
                      Alert.alert(t("Restore"), version.instructions, [
                        { text: t("Cancel"), style: "cancel" },
                        {
                          text: t("Restore"),
                          onPress: () => {
                            void rpc<MobileBot>("bots/restoreInstructions", {
                              botId: bot.id,
                              versionId,
                              expectedInstructions: bot.instructions,
                            })
                              .then((updated) => {
                                setBot(updated);
                                setInstructions(updated.instructions ?? "");
                              })
                              .catch((err) => setError(errorText(err)));
                          },
                        },
                      ]);
                  }}
                />
              ) : null}
            </View>
            <BotCard>
              <View key="computer" style={[styles.advancedCard, styles.advancedComputer]}>
                <ComputerModePicker plain value={computerMode} onChange={setComputerMode} />
              </View>
              <View key="model" style={styles.advancedCard}>
                <MenuPicker
                  plain
                  choices={modelChoices}
                  label={t("Model")}
                  onChange={selectModel}
                  onPress={
                    modelChoices.length > MODEL_SEARCH_THRESHOLD
                      ? () =>
                          router.push({
                            pathname: "/bot-model",
                            params: { botId, value: selectedModelKey },
                          })
                      : undefined
                  }
                  value={selectedModelKey}
                />
              </View>
              {thinkingOptions.length ? (
                <View key="thinking" style={styles.advancedCard}>
                  <MenuPicker
                    plain
                    choices={thinkingChoices}
                    label={t("Thinking")}
                    onChange={setThinkingLevel}
                    value={thinkingLevel}
                  />
                </View>
              ) : null}
              {modelMetaError ? (
                <Text
                  key="modelError"
                  style={[
                    styles.advancedCard,
                    { color: tokens.mutedForeground, paddingVertical: 12, fontSize: 13 },
                  ]}
                >
                  {modelMetaError}
                </Text>
              ) : null}
              <View key="fleet" style={[styles.row, styles.advancedCard, { minHeight: 49 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                  <Text style={[styles.fleetLabel, { color: tokens.mutedForeground }]}>
                    {t("Manage the bots it creates")}
                  </Text>
                  <InfoButton label={t("Manage the bots it creates")}>
                    {t(
                      "Organize the sidebar and edit bots. Instruction, model, routine and group edits need approval.",
                    )}
                  </InfoButton>
                </View>
                <NativeSwitch
                  accessibilityLabel={t("Manage the bots it creates")}
                  onValueChange={(value) => {
                    if (!botId) return;
                    setError(null);
                    fleetSave.update(value);
                  }}
                  tintColor={botSwitchTint(color)}
                  value={fleetManagement}
                />
              </View>
            </BotCard>
          </View>
        ) : null}
        {error ? <Text style={{ color: tokens.destructive, marginTop: 16 }}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}

function thinkingLevelLabel(level: ThinkingLevel, t: (message: string) => string) {
  if (level === "xhigh") return t("Extra high");
  if (level === "low") return t("Low");
  if (level === "medium") return t("Medium");
  if (level === "high") return t("High");
  if (level === "minimal") return t("Minimal");
  if (level === "max") return t("Max");
  return `${level.slice(0, 1).toUpperCase()}${level.slice(1)}`;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 17, paddingBottom: 32 },
  avatar: { alignItems: "center" },
  avatarSpace: { width: 96, height: 96 },
  avatarBadge: {
    position: "absolute",
    left: 64,
    top: 59,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  firstSection: { marginTop: 19.5 },
  section: { marginTop: 24 },
  advancedCard: { paddingHorizontal: 19 },
  advancedComputer: { paddingVertical: 14 },
  field: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 14, fontSize: 17 },
  multilineField: { minHeight: 120, textAlignVertical: "top" },
  cardRow: {
    minHeight: 49,
    paddingStart: 19,
    paddingEnd: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: { flex: 1, color: native.label, fontSize: 17 },
  fleetLabel: { fontSize: 14, flexShrink: 1 },
  rowValue: { flexShrink: 1, color: native.secondaryLabel, fontSize: 17, textAlign: "right" },
});

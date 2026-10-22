import { BOT_NAME_MAX_LENGTH, normalizeCreateBotProfile } from "@rakazo/contracts";
import { BOT_AVATAR_COLORS, SHIPPED_BOT_AVATAR_SHAPE_KEYS } from "@rakazo/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { AvatarPicker } from "../components/avatar-picker";
import { BotAvatar } from "../components/bot-avatar";
import { botHintColor } from "../components/bot-card";
import { GlassIconButton } from "../components/glass-icon-button";
import type { MobileBot } from "../lib/api";
import { rpc } from "../lib/api";
import { withAvatarShape } from "../lib/bot-avatar-edit";
import { allowFocusPrompt, scheduleFocusPrompt } from "../lib/focus-prompt";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";

export default function NewBot() {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Create rides 12pt above the keyboard so it stays reachable; with the keyboard up the sheet
  // reaches the screen's bottom edge.
  const keyboard = useAnimatedKeyboard();
  const footerStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(28, keyboard.height.value + 12),
  }));

  function close() {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }

  async function create() {
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      // Failed list is unknown — delay focus rather than treating the bot as first.
      const existing = await rpc<MobileBot[]>("bots/list").catch(() => null);
      const isFirstBot = existing !== null && existing.length === 0;
      const bot = await rpc<MobileBot>("bots/create", {
        ...normalizeCreateBotProfile({ name, title: "", description: "" }),
        notifyOnFinish: true,
        color: avatar,
      });
      allowFocusPrompt(bot.id);
      router.replace({ pathname: "/thread", params: { botId: bot.id, name: bot.name } });
      void (async () => {
        const started = await rpc("onboarding/start", { botId: bot.id })
          .then(() => true)
          .catch(() => false);
        if (!started) return;
        scheduleFocusPrompt(bot.id, isFirstBot);
      })();
    } catch (err) {
      setError(errorText(err, t("Could not create bot")));
    } finally {
      setPending(false);
    }
  }

  const ready = !!name.trim() && !pending;

  return (
    // The native sheet needs a real root view to attach to; a flattened one leaves it empty.
    <View collapsable={false} style={[styles.sheet, { backgroundColor: tokens.card }]}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.header}>
          <GlassIconButton
            accessibilityLabel={t("Close")}
            android="close"
            iconSize={19}
            ios="xmark"
            onPress={close}
            size={44}
          />
          <Text accessibilityRole="header" style={[styles.title, { color: tokens.foreground }]}>
            {t("Create New Bot")}
          </Text>
        </View>
        <View style={styles.preview}>
          <BotAvatar color={avatar} identity={PREVIEW_IDENTITY} size={196} />
        </View>
        <TextInput
          accessibilityLabel={t("Name")}
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          onChangeText={setName}
          placeholder={t("Name your Bot")}
          placeholderTextColor={botHintColor()}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          style={[
            styles.name,
            {
              color: tokens.foreground,
              backgroundColor: tokens.glassFill,
              borderColor: tokens.popoverBorder,
            },
          ]}
        />
        <View style={styles.picker}>
          <AvatarPicker identity={PREVIEW_IDENTITY} onChange={setAvatar} value={avatar} />
        </View>
        {error ? <Text style={[styles.error, { color: tokens.destructive }]}>{error}</Text> : null}
      </ScrollView>
      <Animated.View style={[styles.footer, footerStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => void create()}
          style={({ pressed }) => [
            styles.create,
            { backgroundColor: tokens.primary },
            !ready && styles.createDisabled,
            pressed && styles.createPressed,
          ]}
        >
          <Text style={[styles.createLabel, { color: tokens.primaryForeground }]}>
            {pending ? t("Creating…") : t("Create")}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Grok starts a new bot as a grey cloud.
const DEFAULT_AVATAR = withAvatarShape(
  BOT_AVATAR_COLORS.at(-1) ?? "",
  SHIPPED_BOT_AVATAR_SHAPE_KEYS.indexOf("cloud"),
);

// Seeds the default look in the preview and the shape grid until the bot has an id.
const PREVIEW_IDENTITY = "new-bot";

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 16,
    marginStart: -2,
  },
  title: { fontSize: 17 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: 16 },
  preview: { alignItems: "center", marginTop: -13 },
  name: {
    marginTop: 44,
    height: 54,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 20,
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  picker: { marginTop: 34 },
  error: { marginTop: 16, textAlign: "center" },
  create: {
    marginHorizontal: 13,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  // Grok greys the whole pill out until the bot has a name.
  createDisabled: { opacity: 0.5 },
  createPressed: { opacity: 0.8 },
  createLabel: { fontSize: 17, fontWeight: "500" },
});

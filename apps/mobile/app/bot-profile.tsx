import type { ComputerStatus, Routine } from "@rakazo/contracts";
import { displayName } from "@rakazo/core";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BotAvatar } from "../components/bot-avatar";
import { BotCard, BotCardRow, botHintColor } from "../components/bot-card";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeSwitch } from "../components/native-switch";
import type { MobileBot } from "../lib/api";
import { currentApiBase, loadSessionToken, rpc, selectedSpaceId } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { botSwitchTint } from "../lib/bot-avatar-edit";
import { useI18n } from "../lib/i18n";
import { afterChatNotifyChange } from "../lib/live-notifications";
import { native, useThemedStyles } from "../lib/native";
import { createQueuedSave } from "../lib/queued-save";
import { errorText } from "../lib/user-error";

export default function BotProfile() {
  const { t } = useI18n();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { botId = "", name: nameParam } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const [bot, setBot] = useState<MobileBot | null>(null);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [routinesError, setRoutinesError] = useState<string | null>(null);
  const name = displayName(bot?.name ?? nameParam, t("Bot"));
  const [computerState, setComputerState] = useState<ComputerStatus["state"] | null>(null);
  // Counts switch saves as they start and end, so a reload can tell it overlapped one.
  const notifySaves = useRef(0);
  const notifyQueue = useRef<ReturnType<typeof createQueuedSave<boolean>> | null>(null);

  // Reload on focus so edits made in Chat settings or a routine show on return.
  useFocusEffect(
    useCallback(() => {
      if (!botId) return;
      let current = true;
      const saves = notifySaves.current;
      void rpc<MobileBot>("bots/get", { botId })
        .then((next) => {
          if (!current) return;
          // A read that overlapped a save may predate it; keep the switch as the user left it.
          const overlapped = saves % 2 === 1 || saves !== notifySaves.current;
          if (!overlapped) notifyQueue.current?.reset(next.notifyOnFinish);
          setBot((shown) =>
            overlapped && shown ? { ...next, notifyOnFinish: shown.notifyOnFinish } : next,
          );
        })
        .catch(() => undefined);
      return () => {
        current = false;
      };
    }, [botId]),
  );

  // Only the latest load (on focus or retry) may set state; leaving the screen drops them all.
  const routinesRequest = useRef(0);
  const loadRoutines = useCallback(() => {
    if (!botId) return;
    const request = ++routinesRequest.current;
    void rpc<Routine[]>("routines/list", { botId })
      .then((next) => {
        if (request !== routinesRequest.current) return;
        setRoutines(next);
        setRoutinesError(null);
      })
      .catch((error) => {
        if (request === routinesRequest.current) {
          setRoutinesError(errorText(error, t("Could not load routines")));
        }
      });
    return () => {
      routinesRequest.current += 1;
    };
  }, [botId, t]);
  useFocusEffect(loadRoutines);

  useFocusEffect(
    useCallback(() => {
      if (!botId) return;
      let current = true;
      void rpc<ComputerStatus>("computer/status", { botId })
        .then((status) => {
          if (current) setComputerState(status.state);
        })
        .catch(() => undefined);
      return () => {
        current = false;
      };
    }, [botId]),
  );

  // The chat list's Silence notifications saves the same setting. The switch moves
  // first and moves back if the save fails.
  const setNotifyOnFinish = (notifyOnFinish: boolean) => {
    if (!bot) return;
    notifyQueue.current ??= createQueuedSave(bot.notifyOnFinish, {
      onChange: (notifyOnFinish) => setBot((current) => current && { ...current, notifyOnFinish }),
      save: async (notifyOnFinish) => {
        await rpc("bots/update", { botId, notifyOnFinish });
      },
      onSavingChange: () => {
        notifySaves.current += 1;
      },
      onSaved: async (notify) => {
        try {
          await afterChatNotifyChange(
            currentApiBase(),
            await loadSessionToken(),
            selectedSpaceId() ?? "",
            { threadId: bot.threadId, notify },
          );
        } catch {
          // The server save succeeded; device reconciliation can retry later.
        }
      },
      onError: (error) =>
        Alert.alert(t("Could not update notifications"), errorText(error, t("Try again."))),
    });
    notifyQueue.current.update(notifyOnFinish);
  };

  const activeRoutines = routines?.filter((routine) => routine.active).length;
  const computerValue =
    computerState === "running" ? t("Running") : computerState === "suspended" ? t("Asleep") : "";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          ...glassHeaderOptions(name),
          // The avatar and name below name the page; the bar title stays for the back menu.
          ...(Platform.OS === "ios" ? { headerTitle: "" } : null),
        }}
      />
      <View style={styles.identity}>
        {bot ? (
          <BotAvatar color={bot.color} identity={bot.id} size={104} status={bot.status} />
        ) : (
          <View style={styles.avatarSpace} />
        )}
        <Text accessibilityRole="header" style={styles.name}>
          {name}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/bot-settings", params: { botId } })}
          style={({ pressed }) => [styles.edit, pressed && styles.editPressed]}
        >
          <Text style={styles.editLabel}>{t("Edit")}</Text>
        </Pressable>
      </View>
      <BotCard separatorInset={52}>
        <BotCardRow
          key="routines"
          icon={{ ios: "clock", android: "time-outline" }}
          title={routinesError ?? t("Routines")}
          value={
            routinesError
              ? t("Try again.")
              : activeRoutines === undefined
                ? undefined
                : t("{count} on", { count: activeRoutines })
          }
          onPress={() =>
            routinesError
              ? void loadRoutines()
              : router.push({ pathname: "/routine", params: { botId, botName: name } })
          }
        />
        <BotCardRow
          key="library"
          icon={{ ios: "folder", android: "folder-outline" }}
          title={t("Library")}
          onPress={() => router.push({ pathname: "/artifacts", params: { botId } })}
        />
        <BotCardRow
          key="computer"
          icon={{ ios: "desktopcomputer", android: "desktop-outline" }}
          title={t("Computer")}
          value={computerValue}
          onPress={() => router.push({ pathname: "/computer", params: { botId, name } })}
        />
      </BotCard>
      {bot ? (
        <View>
          <BotCard>
            <View key="notifications" style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t("Notifications")}</Text>
              <NativeSwitch
                accessibilityLabel={t("Notifications")}
                onValueChange={setNotifyOnFinish}
                tintColor={botSwitchTint(bot.color)}
                value={bot.notifyOnFinish}
              />
            </View>
          </BotCard>
          <Text style={styles.footer}>
            {t("Get notified when this Bot finishes or is waiting for you")}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: tokens.card },
    content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 13, paddingBottom: 32, gap: 24 },
    identity: { alignItems: "center" },
    avatarSpace: { width: 104, height: 104 },
    name: {
      marginTop: 3,
      color: native.label,
      fontSize: 22,
      fontWeight: "600",
      textAlign: "center",
    },
    edit: {
      marginTop: 12,
      minWidth: 52,
      height: 37,
      paddingHorizontal: 13,
      borderRadius: 18.5,
      backgroundColor: tokens.popoverBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    editPressed: { opacity: 0.7 },
    editLabel: { color: native.label, fontSize: 15, fontWeight: "500" },
    switchRow: {
      minHeight: 55,
      paddingStart: 19,
      paddingEnd: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    switchLabel: { flex: 1, color: native.label, fontSize: 17 },
    footer: {
      marginTop: 12,
      paddingHorizontal: 18,
      color: botHintColor(),
      fontSize: 14,
      lineHeight: 19,
    },
  });
}

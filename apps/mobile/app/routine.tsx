import type { Routine } from "@rakazo/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { glassHeaderOptions } from "../components/glass-title";
import { NativeSwitch } from "../components/native-switch";
import { rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import {
  deviceTimeZone,
  routineRowDetail,
  routineSchedule,
  sortRoutinesByNextRun,
} from "../lib/routine";
import { errorText } from "../lib/user-error";

/** A bot's routines, or one routine when a routineId is given. */
export default function RoutineScreen() {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  const { botId, botName, routineId, origin } = useLocalSearchParams<{
    botId?: string;
    botName?: string;
    routineId?: string;
    origin?: string;
  }>();
  const router = useRouter();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeZone = deviceTimeZone();

  useEffect(() => {
    if (!botId) {
      setError(t("Routine link is incomplete"));
      return;
    }
    let cancelled = false;
    setRoutines(null);
    setError(null);
    void rpc<Routine[]>("routines/list", { botId })
      .then((list) => {
        if (cancelled) return;
        setRoutines(sortRoutinesByNextRun(list));
        if (routineId && !list.some((item) => item.id === routineId)) {
          setError(t("This routine no longer exists"));
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorText(loadError, t("Could not load routine")));
      });
    return () => {
      cancelled = true;
    };
  }, [botId, routineId]);

  /** Pauses or resumes at once; the switch flips back if the server refuses. */
  function setActive(routine: Routine, active: boolean) {
    const apply = (value: boolean) =>
      setRoutines(
        (current) =>
          current?.map((item) => (item.id === routine.id ? { ...item, active: value } : item)) ??
          current,
      );
    apply(active);
    void rpc("routines/update", { routineId: routine.id, active }).catch((updateError) => {
      apply(!active);
      Alert.alert(t("Could not update routine"), errorText(updateError, t("Try again.")));
    });
  }

  const routine = routineId ? routines?.find((item) => item.id === routineId) : undefined;
  const title = routineId ? (routine?.name ?? t("Routine")) : t("Routines");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          ...glassHeaderOptions(title),
          headerTitle: title,
          headerTitleStyle: { fontWeight: "400" },
        }}
      />
      {!routines && !error ? <ActivityIndicator color={native.secondaryLabel} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {routineId ? (
        routine ? (
          <>
            <View style={[styles.card, styles.switchRow]}>
              <Text style={styles.text}>{t("Active")}</Text>
              <NativeSwitch
                value={routine.active}
                onValueChange={(value) => setActive(routine, value)}
                accessibilityLabel={t("Active")}
              />
            </View>
            <Text style={styles.label}>{t("Instruction")}</Text>
            <View style={styles.card}>
              <Text selectable style={styles.text}>
                {routine.prompt}
              </Text>
            </View>
            <Text style={styles.label}>{t("Schedule")}</Text>
            <View style={styles.card}>
              <Text style={styles.text}>{routineSchedule(routine, timeZone)}</Text>
            </View>
            {origin !== "profile" ? (
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.push({
                    pathname: "/thread",
                    params: { botId: botId ?? "", name: botName ?? t("Bot") },
                  })
                }
                style={({ pressed }) => [styles.card, styles.spaced, pressed && styles.pressed]}
              >
                <Text style={[styles.text, styles.link]}>{t("Open conversation")}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null
      ) : routines ? (
        routines.length ? (
          <View style={[styles.card, styles.list]}>
            {routines.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/routine",
                    params: { botId, botName, routineId: item.id, origin },
                  })
                }
                style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
              >
                <View style={styles.listText}>
                  <Text style={styles.text}>{item.name}</Text>
                  <Text style={styles.detail}>{routineRowDetail(item, timeZone)}</Text>
                </View>
                <NativeSwitch
                  value={item.active}
                  onValueChange={(value) => setActive(item, value)}
                  accessibilityLabel={item.name}
                />
                {index < routines.length - 1 ? <View style={styles.separator} /> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{t("No routines yet")}</Text>
        )
      ) : null}
    </ScrollView>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: tokens.groupedBackground },
    content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
    error: { color: tokens.destructive, fontSize: 15, paddingHorizontal: 19 },
    empty: { color: native.secondaryLabel, fontSize: 15, textAlign: "center", paddingTop: 24 },
    // Grouped cards: 16pt from the screen edges with a hairline rim.
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.groupedDivider,
      backgroundColor: tokens.groupedCard,
      paddingHorizontal: 19,
      paddingVertical: 14,
      overflow: "hidden",
    },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    spaced: { marginTop: 16 },
    pressed: { backgroundColor: tokens.groupedDivider },
    label: {
      color: native.secondaryLabel,
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 19,
      paddingTop: 16,
      paddingBottom: 6,
    },
    text: { color: native.label, fontSize: 17, lineHeight: 22 },
    link: { color: tokens.link },
    detail: { color: native.secondaryLabel, fontSize: 15, lineHeight: 20 },
    list: { paddingHorizontal: 0, paddingVertical: 0 },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingLeft: 19,
      paddingRight: 18,
      paddingVertical: 13,
    },
    listText: { flex: 1, minWidth: 0, gap: 1 },
    separator: {
      position: "absolute",
      left: 19,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: tokens.groupedDivider,
    },
  });
}

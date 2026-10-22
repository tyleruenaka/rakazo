import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AvatarPicker } from "../components/avatar-picker";
import { BotAvatar } from "../components/bot-avatar";
import { BotCard } from "../components/bot-card";
import { floatingHeaderOptions } from "../components/glass-title";
import { trailingHeaderOptions } from "../components/sheet-header";
import { mobileTokens } from "../lib/appearance";
import { pickAvatarPhoto } from "../lib/avatar-photo";
import { defaultAvatarValue } from "../lib/bot-avatar-edit";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";

/** Shape, color or photo for a bot; Done hands the pick back to Edit Bot, which saves it. */
export default function BotAvatarScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { botId = "", value: initial = "" } = useLocalSearchParams<{
    botId?: string;
    value?: string;
  }>();
  const [value, setValue] = useState(initial);

  function done() {
    router.dismissTo({ pathname: "/bot-settings", params: { botId, avatar: value } });
  }

  async function upload() {
    try {
      const photo = await pickAvatarPhoto();
      if (photo) setValue(photo);
    } catch {
      Alert.alert(t("Could not use that image as an avatar."));
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          ...floatingHeaderOptions(),
          headerTitle: undefined,
          title: t("Avatar"),
          headerTitleStyle: { fontWeight: "400" },
          ...trailingHeaderOptions(t("Done"), done, value === initial),
        }}
      />
      <View style={styles.segments}>
        <View style={[styles.segment, styles.segmentSelected]}>
          <Text style={styles.segmentLabel}>{t("Shape")}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void upload()} style={styles.segment}>
          <Text style={[styles.segmentLabel, styles.segmentIdle]}>{t("Upload")}</Text>
        </Pressable>
      </View>
      <View style={styles.preview}>
        <BotAvatar color={value} identity={botId} size={96} />
      </View>
      <BotCard separatorInset={18}>
        <View key="picker" style={styles.picker}>
          <AvatarPicker identity={botId} onChange={setValue} value={value} />
        </View>
        <Pressable
          key="reset"
          accessibilityRole="button"
          onPress={() => setValue(defaultAvatarValue(value))}
          style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
        >
          <Text style={styles.resetLabel}>{t("Reset to default")}</Text>
        </Pressable>
      </BotCard>
    </ScrollView>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: tokens.card },
    content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
    segments: { flexDirection: "row", justifyContent: "center", gap: 4 },
    segment: {
      height: 38,
      paddingHorizontal: 14,
      borderRadius: 19,
      justifyContent: "center",
    },
    segmentSelected: { backgroundColor: tokens.popoverBorder },
    segmentLabel: { color: native.label, fontSize: 17 },
    segmentIdle: { color: native.secondaryLabel },
    preview: { alignItems: "center", marginTop: 24, marginBottom: 23 },
    picker: { paddingTop: 24, paddingBottom: 18 },
    reset: { minHeight: 49, paddingHorizontal: 18, justifyContent: "center" },
    resetLabel: { color: tokens.link, fontSize: 17 },
    pressed: { backgroundColor: native.fillPressed },
  });
}

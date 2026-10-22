import type { VoiceChatGroup } from "@rakazo/core";
import { speechFromBlocks, voiceChatDuration } from "@rakazo/core";
import { typeScale } from "@rakazo/ui-tokens";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileMessage } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One call's exchange, collapsed to a line in the thread; tapping it opens the transcript. */
export function VoiceChatCard({
  group,
  userBubble,
}: {
  group: VoiceChatGroup<MobileMessage>;
  /** The thread's own-bubble color, so the transcript matches it. */
  userBubble?: string;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const title = `${t("Voice chat")} · ${clock(voiceChatDuration(group))}`;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Show transcript")}
        onPress={() => setOpen(true)}
        style={styles.row}
      >
        <NativeSymbol
          ios="waveform"
          android="pulse-outline"
          size={13}
          color={tokens.faintForeground}
        />
        <Text style={[styles.label, { color: tokens.faintForeground }]}>{title}</Text>
      </Pressable>
      {open ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable
            accessibilityLabel={t("Close")}
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay }]}
          />
          <View
            accessibilityViewIsModal
            style={[styles.sheet, { top: insets.top + 62, backgroundColor: tokens.background }]}
          >
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Close")}
                hitSlop={4}
                onPress={() => setOpen(false)}
                style={[styles.close, { backgroundColor: tokens.muted }]}
              >
                <NativeSymbol ios="xmark" android="close" size={18} color={tokens.foreground} />
              </Pressable>
              <Text numberOfLines={1} style={[styles.title, { color: tokens.foreground }]}>
                {title}
              </Text>
            </View>
            <ScrollView contentContainerStyle={styles.transcript}>
              {group.messages.map((message) => {
                // The marker is the call's summary line, never a transcript turn.
                if (message === group.marker) return null;
                const text = speechFromBlocks(message.blocks).trim();
                if (!text) return null;
                const user = message.role === "user";
                return (
                  <Text
                    key={message.id}
                    style={[
                      styles.bubble,
                      user
                        ? {
                            alignSelf: "flex-end",
                            backgroundColor: userBubble ?? tokens.chatUser,
                            color: tokens.chatUserForeground,
                          }
                        : {
                            alignSelf: "flex-start",
                            backgroundColor: tokens.muted,
                            color: tokens.foreground,
                          },
                    ]}
                  >
                    {text}
                  </Text>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  label: { fontSize: 16, lineHeight: 21, fontVariant: ["tabular-nums"] },
  // A card floating inside the screen edges over the dimmed thread.
  sheet: {
    position: "absolute",
    start: 8,
    end: 8,
    bottom: 8,
    borderRadius: 48,
    borderCurve: "continuous",
    overflow: "hidden",
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: 18, fontWeight: "500", fontVariant: ["tabular-nums"] },
  transcript: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 32, gap: 10 },
  bubble: {
    ...typeScale.body,
    maxWidth: "80%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: "hidden",
    writingDirection: "auto",
  },
});

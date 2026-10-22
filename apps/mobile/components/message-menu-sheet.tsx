import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { messageMenuPlacement } from "../lib/message-menu-placement";
import { useMobileTokens } from "../lib/native";
import type { MessageMenuSpec } from "./message-action-menu";
import { MessageMenuContent } from "./message-menu-content";

const MENU_MAX_WIDTH = 340;

/** Android: the same content in a card next to the finger. */
export function MessageMenuSheet({
  menu,
  onClosed,
}: {
  menu: MessageMenuSpec;
  onClosed: () => void;
}) {
  const tokens = useMobileTokens();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const { left, top, menuWidth, maxHeight } = messageMenuPlacement({
    width,
    height,
    insets,
    anchor: menu.anchor,
    measuredHeight: size?.height ?? 0,
    maxWidth: MENU_MAX_WIDTH,
  });
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClosed}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Cancel")}
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay }]}
        onPress={onClosed}
      />
      <View
        onLayout={(event) => setSize(event.nativeEvent.layout)}
        style={{
          position: "absolute",
          left,
          top,
          width: menuWidth,
          opacity: size ? 1 : 0,
          maxHeight,
          borderRadius: 28,
          backgroundColor: tokens.sheet,
        }}
      >
        <ScrollView
          style={{ maxHeight }}
          bounces={false}
          contentContainerStyle={{ paddingVertical: 16 }}
        >
          <MessageMenuContent
            menu={menu}
            onSelect={(action) => {
              onClosed();
              action();
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

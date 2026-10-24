import { Pressable, StyleSheet, Text } from "react-native";
import { useMobileTokens } from "../lib/native";
import type { JumpDirection } from "../lib/offscreen-unreads";
import { NativeSymbol } from "./native-symbol";

export const UNREAD_JUMP_PILL_HEIGHT = 36;

/** A solid unread-blue capsule with a directional chevron and label, like the inbox's badges. */
export function UnreadJumpPill({
  direction,
  label,
  accessibilityLabel,
  onPress,
}: {
  direction: JumpDirection;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const tokens = useMobileTokens();
  // White on the unread blue in both themes.
  const onFill = tokens.destructiveForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: tokens.unread },
        pressed && styles.pressed,
      ]}
    >
      <NativeSymbol
        ios={direction === "above" ? "chevron.up" : "chevron.down"}
        android={direction === "above" ? "chevron-up" : "chevron-down"}
        size={14}
        weight="semibold"
        color={onFill}
      />
      <Text style={[styles.label, { color: onFill }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: UNREAD_JUMP_PILL_HEIGHT,
    borderRadius: UNREAD_JUMP_PILL_HEIGHT / 2,
    paddingStart: 15,
    paddingEnd: 14,
  },
  pressed: {
    opacity: 0.55,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
});

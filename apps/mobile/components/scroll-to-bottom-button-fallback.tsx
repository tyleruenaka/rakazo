import { Pressable, StyleSheet } from "react-native";
import { native, useMobileTokens } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

export type ScrollToBottomButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
};

export function ScrollToBottomButtonFallback({
  accessibilityLabel,
  onPress,
}: ScrollToBottomButtonProps) {
  const tokens = useMobileTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={3}
      android_ripple={{ color: native.fillPressed, borderless: true, radius: 19 }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: tokens.muted,
          borderColor: tokens.popoverBorder,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <NativeSymbol ios="chevron.down" android="chevron-down" size={15} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

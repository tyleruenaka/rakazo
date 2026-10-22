import type { ReactNode } from "react";
import type { GestureResponderEvent } from "react-native";
import { Pressable } from "react-native";

/** Long-pressing a message opens its reaction and action sheet. */
export function MessageContextMenu({
  children,
  fullWidth = false,
  onLongPress,
}: {
  children: ReactNode;
  fullWidth?: boolean;
  onLongPress?: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      accessible={false}
      onLongPress={onLongPress}
      style={{ maxWidth: "100%", width: fullWidth ? "100%" : undefined, flexShrink: 1 }}
    >
      {children}
    </Pressable>
  );
}

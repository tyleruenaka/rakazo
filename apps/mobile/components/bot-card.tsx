import type { ComponentProps, ReactNode } from "react";
import { Children, Fragment, isValidElement } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Platform, PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { native, useThemedStyles } from "../lib/native";
import { NativeSymbol } from "./native-symbol";

/** Section labels and captions on the bot pages: the system's faintest label color. */
export function botHintColor() {
  return Platform.OS === "ios" ? PlatformColor("tertiaryLabel") : mobileTokens().faintForeground;
}

/** Bordered card on the bot pages; rows inside are divided by inset hairlines. */
export function BotCard({
  children,
  separatorInset = 20,
  style,
}: {
  children: ReactNode;
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.card, style]}>
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          {index > 0 ? <View style={[styles.separator, { marginStart: separatorInset }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** Small gray label above a card. */
export function BotCardLabel({ children }: { children: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Text accessibilityRole="header" style={styles.label}>
      {children}
    </Text>
  );
}

export function BotCardRow({
  title,
  value,
  icon,
  chevron = true,
  destructive = false,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  title: string;
  value?: string;
  icon?: ComponentProps<typeof NativeSymbol>;
  chevron?: boolean;
  /** Red title and icon, for actions like clearing a conversation. */
  destructive?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [styles.row, icon && styles.iconRow, pressed && styles.pressed]}
    >
      {icon ? (
        <View style={styles.icon}>
          <NativeSymbol
            color={destructive ? mobileTokens().destructive : native.secondaryLabel}
            size={19}
            {...icon}
          />
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.title, destructive && { color: mobileTokens().destructive }]}
      >
        {title}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {chevron ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <NativeSymbol
            android="chevron-forward"
            color={native.secondaryLabel}
            ios="chevron.right"
            size={15}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: tokens.popoverBorder,
      backgroundColor: tokens.glassFill,
      overflow: "hidden",
    },
    separator: { height: 1, backgroundColor: tokens.popoverBorder },
    label: { color: botHintColor(), fontSize: 15, paddingStart: 18, marginBottom: 7.5 },
    row: {
      minHeight: 49,
      paddingStart: 19,
      paddingEnd: 19.5,
      flexDirection: "row",
      alignItems: "center",
    },
    iconRow: { paddingStart: 20 },
    icon: { width: 32, alignItems: "flex-start" },
    title: { flex: 1, color: native.label, fontSize: 17 },
    value: {
      flexShrink: 1,
      color: native.secondaryLabel,
      fontSize: 17,
      marginStart: 12,
      marginEnd: 16,
    },
    pressed: { backgroundColor: native.fillPressed },
  });
}

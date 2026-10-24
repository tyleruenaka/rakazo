import { fontWeight, typeScale } from "@rakazo/ui-tokens";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { bubbleShade } from "../lib/user-bubble-color";

/**
 * Marks where the messages the user hadn't seen yet begin. Sized like the time separator.
 * `accent` is the bot color tinting your bubbles: the lines take the bubble shade, and in dark
 * "New" takes the full color because the shade is too dim for text. Without it, unread blue.
 */
export function UnreadDivider({
  afterSeparator = false,
  accent,
}: {
  afterSeparator?: boolean;
  accent?: string;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const dark = useResolvedAppearance() === "dark";
  const lineColor = accent ? bubbleShade(accent) : tokens.unread;
  const labelColor = accent && dark ? accent : lineColor;
  const line = [styles.line, { backgroundColor: lineColor }];
  return (
    <View
      accessibilityLabel={t("New messages")}
      accessible
      style={[styles.row, afterSeparator && { paddingTop: 0 }]}
    >
      <View style={line} />
      <Text style={[styles.label, { color: labelColor }]}>{t("New")}</Text>
      <View style={line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, paddingBottom: 8 },
  line: { flex: 1, height: 1, opacity: 0.4 },
  label: { ...typeScale.caption, fontWeight: fontWeight.medium },
});

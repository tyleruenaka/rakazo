import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileTokens } from "../lib/native";
import { BotAvatar } from "./bot-avatar";
import type { MessageMenuSpec } from "./message-action-menu";
import { NativeSymbol } from "./native-symbol";

/** Reaction circles over grouped action rows; `onSelect` closes the sheet, then runs the action. */
export function MessageMenuContent({
  menu,
  onSelect,
}: {
  menu: MessageMenuSpec;
  onSelect: (action: () => void) => void;
}) {
  const tokens = useMobileTokens();
  return (
    <View style={styles.content}>
      {menu.reactions.length > 0 ? (
        <View style={styles.reactions}>
          {menu.reactions.map((reaction) => (
            <Pressable
              key={reaction.emoji}
              accessibilityRole="button"
              accessibilityLabel={reaction.emoji}
              accessibilityState={{ selected: reaction.selected }}
              onPress={() => onSelect(reaction.onPress)}
              style={({ pressed }) => [
                styles.reaction,
                {
                  backgroundColor:
                    pressed || reaction.selected ? tokens.paletteHighlight : tokens.chatBot,
                },
              ]}
            >
              <Text style={styles.emoji}>{reaction.emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {menu.groups
        .filter((group) => group.length > 0)
        .map((group, groupIndex) => (
          <View
            key={`${groupIndex}-${group[0]?.name}`}
            style={[styles.group, { backgroundColor: tokens.chatBot }]}
          >
            {group.map((item, index) => (
              <Pressable
                key={item.name}
                accessibilityRole="menuitem"
                accessibilityLabel={item.text}
                onPress={() => onSelect(item.onPress)}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? { backgroundColor: tokens.paletteHighlight } : null,
                ]}
              >
                {index > 0 ? (
                  <View style={[styles.divider, { backgroundColor: tokens.controlOpenBorder }]} />
                ) : null}
                <View style={styles.icon}>
                  {"botId" in item.icon ? (
                    <BotAvatar color={item.icon.botColor} identity={item.icon.botId} size={20} />
                  ) : (
                    <NativeSymbol
                      ios={item.icon.ios}
                      android={item.icon.android}
                      size={19}
                      color={tokens.foreground}
                    />
                  )}
                </View>
                <Text style={[styles.label, { color: tokens.foreground }]}>{item.text}</Text>
              </Pressable>
            ))}
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingHorizontal: 16 },
  reactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
    paddingHorizontal: 11,
    marginBottom: 5,
  },
  reaction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 24 },
  group: { borderRadius: 12, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    height: 48,
    paddingLeft: 18,
    paddingRight: 16,
  },
  divider: { position: "absolute", top: 0, left: 49, right: 0, height: 1 },
  icon: { width: 20, alignItems: "center" },
  label: { fontSize: 17 },
});

import { BOT_AVATAR_SHAPE_COUNT } from "@rakazo/contracts";
import { BOT_AVATAR_COLORS } from "@rakazo/core";
import { Pressable, StyleSheet, View } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { avatarColor, avatarShape, isAvatarPhoto, withAvatarShape } from "../lib/bot-avatar-edit";
import { useI18n } from "../lib/i18n";
import { useThemedStyles } from "../lib/native";
import { BotAvatar } from "./bot-avatar";

const SHAPE_SIZE = 42;
// The default look first, then the shipped shapes.
const SHAPES = [null, ...Array.from({ length: BOT_AVATAR_SHAPE_COUNT }, (_, shape) => shape)];

/**
 * Shape grid and color dots for a bot avatar value. `value` is null until something is
 * picked, so a new bot can keep the server's color.
 */
export function AvatarPicker({
  value,
  identity,
  onChange,
}: {
  value: string | null;
  identity?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const tokens = mobileTokens();
  const color = value === null ? tokens.avatarGrey : avatarColor(value);
  const shape = value === null || isAvatarPhoto(value) ? undefined : avatarShape(value);
  return (
    <View style={styles.picker}>
      <View accessibilityRole="radiogroup" style={styles.shapes}>
        {SHAPES.map((option) => {
          const selected = shape === option;
          const look = option === null ? color : withAvatarShape(color, option);
          return (
            <Pressable
              key={option ?? "default"}
              accessibilityRole="radio"
              accessibilityLabel={
                option === null ? t("Default") : t("Shape {number}", { number: option + 1 })
              }
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(look)}
              style={styles.shapeCell}
            >
              {selected ? (
                // A ring that follows the outline: the shape drawn larger in the ring color,
                // then in the card color, then itself.
                <>
                  <ShapeLayer
                    color={ringValue(tokens.faintForeground, option)}
                    id={identity}
                    scale={1.26}
                  />
                  <ShapeLayer
                    color={ringValue(tokens.glassFill, option)}
                    id={identity}
                    scale={1.15}
                  />
                </>
              ) : null}
              <BotAvatar color={look} identity={identity} size={SHAPE_SIZE} />
            </Pressable>
          );
        })}
      </View>
      <View accessibilityRole="radiogroup" style={styles.colors}>
        {BOT_AVATAR_COLORS.map((option, index) => {
          const selected =
            value !== null && !isAvatarPhoto(value) && color.toUpperCase() === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={t("Color {number}", { number: index + 1 })}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(shape == null ? option : withAvatarShape(option, shape))}
              style={[styles.colorCell, selected && styles.colorRing]}
            >
              <View style={[styles.dot, { backgroundColor: option }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ringValue(hex: string, shape: number | null) {
  return shape === null ? hex : withAvatarShape(hex, shape);
}

function ShapeLayer({ color, id, scale }: { color: string; id?: string; scale: number }) {
  const size = SHAPE_SIZE * scale;
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      <BotAvatar color={color} identity={id} size={size} />
    </View>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    picker: { gap: 28 },
    shapes: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      rowGap: 18,
    },
    shapeCell: {
      width: 70,
      height: SHAPE_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    colors: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      rowGap: 8,
      paddingHorizontal: 12,
    },
    colorCell: {
      width: 36,
      height: 36,
      marginHorizontal: 8.3,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    colorRing: { borderColor: tokens.faintForeground },
    dot: { width: 25, height: 25, borderRadius: 12.5 },
  });
}

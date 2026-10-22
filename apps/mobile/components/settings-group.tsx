import type { ReactNode } from "react";
import { Children, Fragment, isValidElement } from "react";
import type { PressableProps } from "react-native";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { native, useThemedStyles } from "../lib/native";
import { androidRipple } from "../lib/ripple";
import { stacksAtTextScale } from "../lib/text-scale";
import { NativeSwitch } from "./native-switch";
import { Chevron } from "./row-accessories";

export function useStackedSettings(): boolean {
  return stacksAtTextScale(useWindowDimensions().fontScale);
}

export function SettingsLabel({ children }: { children: string }) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  return (
    <Text accessibilityRole="header" style={[styles.groupLabel, stacked && styles.compactLabel]}>
      {children}
    </Text>
  );
}

export function SettingsFooter({ children }: { children: string }) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  return <Text style={[styles.footer, stacked && styles.compactLabel]}>{children}</Text>;
}

export function SettingsGroup({
  label,
  accessibilityLabel,
  footer,
  children,
}: {
  label?: string;
  accessibilityLabel?: string;
  footer?: string;
  children: ReactNode;
}) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.group}>
      {label ? <SettingsLabel>{label}</SettingsLabel> : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? (
              <View style={[styles.separator, stacked && styles.compactSeparator]} />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <SettingsFooter>{footer}</SettingsFooter> : null}
    </View>
  );
}

type SettingsRowProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  detail?: string;
  value?: string;
  chevron?: "right" | "down";
  prominent?: boolean;
  destructive?: boolean;
  dimmed?: boolean;
  trailing?: ReactNode;
};

export function SettingsRow({
  title,
  detail,
  value,
  chevron,
  prominent,
  destructive,
  dimmed,
  trailing,
  ...props
}: SettingsRowProps) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  const end = (
    <>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {trailing}
    </>
  );
  const content = (
    <>
      <View style={styles.titleColumn}>
        <Text
          style={[styles.title, prominent && styles.prominent, destructive && styles.destructive]}
        >
          {title}
        </Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {stacked ? end : null}
      </View>
      {stacked ? null : end}
      {chevron ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Chevron color={mobileTokens().sheetChevron} expanded={chevron === "down"} size={15} />
        </View>
      ) : null}
    </>
  );
  if (!props.onPress) {
    return (
      <View
        accessible={props.accessible}
        style={[styles.row, stacked && styles.compactRow, dimmed && styles.dimmed]}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      {...props}
      android_ripple={androidRipple()}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.compactRow,
        pressed && Platform.OS !== "android" && styles.pressed,
        dimmed && styles.dimmed,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function SettingsSwitch({
  label,
  accessibilityLabel,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  accessibilityLabel?: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const styles = useThemedStyles(createSettingsStyles);
  const stacked = useStackedSettings();
  const toggle = (
    <View style={stacked ? styles.stackedSwitch : undefined}>
      <NativeSwitch
        accessibilityHint={detail}
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        onValueChange={onChange}
        tintColor={mobileTokens().sheetSwitch}
        value={value}
      />
    </View>
  );
  return (
    <View style={[styles.row, stacked && styles.compactRow]}>
      <View style={styles.titleColumn}>
        <Text style={styles.title}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {stacked ? toggle : null}
      </View>
      {stacked ? null : toggle}
    </View>
  );
}

function createSettingsStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    group: { gap: 8 },
    groupLabel: {
      color: tokens.sheetLabel,
      fontSize: 14,
      lineHeight: 18,
      paddingStart: 19,
    },
    footer: {
      color: tokens.sheetLabel,
      fontSize: 14,
      lineHeight: 18,
      paddingHorizontal: 19,
    },
    card: {
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: tokens.sheetBorder,
      overflow: "hidden",
      backgroundColor: tokens.sheetCell,
    },
    separator: {
      height: 1,
      marginStart: 18,
      backgroundColor: tokens.sheetBorder,
    },
    row: {
      minHeight: 49,
      paddingStart: 19,
      paddingEnd: 20,
      paddingVertical: 13.5,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    compactLabel: { paddingStart: 12 },
    compactSeparator: { marginStart: 12 },
    compactRow: { paddingHorizontal: 12, gap: 8 },
    titleColumn: { flex: 1, flexShrink: 1, gap: 2 },
    stackedSwitch: { alignSelf: "flex-start", marginTop: 6 },
    title: { color: native.label, fontSize: 17, lineHeight: 22 },
    prominent: { fontSize: 20, fontWeight: "600" },
    detail: { color: native.secondaryLabel, fontSize: 14, lineHeight: 18 },
    destructive: { color: tokens.destructive },
    value: { flexShrink: 1, color: native.secondaryLabel, fontSize: 17, lineHeight: 22 },
    pressed: { backgroundColor: native.fillPressed },
    dimmed: { opacity: 0.45 },
  });
}

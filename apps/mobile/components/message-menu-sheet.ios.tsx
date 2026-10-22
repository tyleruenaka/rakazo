import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import type { MessageMenuSpec } from "./message-action-menu";
import { MessageMenuContent } from "./message-menu-content";

/**
 * A floating sheet from the bottom edge. React Native's own modal, not a SwiftUI sheet: content
 * hosted in a SwiftUI sheet doesn't receive React Native presses.
 */
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
  const [height, setHeight] = useState(0);
  const shown = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  // At rest the sheet drops its animated offset: touches are hit-tested against committed
  // layout, which never sees the animated slide and would keep the rows off screen.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!height) return;
    Animated.spring(shown, {
      toValue: 1,
      stiffness: 320,
      damping: 34,
      useNativeDriver: true,
    }).start(({ finished }) => finished && setSettled(true));
  }, [height, shown]);

  // Runs the action once the sheet has gone, so it can present its own sheet.
  const close = (action?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    setSettled(false);
    Animated.timing(shown, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      onClosed();
      action?.();
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => setSettled(false),
      onPanResponderMove: (_, gesture) => drag.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 90 || gesture.vy > 0.8) {
          close();
          return;
        }
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(
          ({ finished }) => finished && setSettled(true),
        );
      },
    }),
  ).current;

  const offset = height + insets.bottom;
  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => close()}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: shown }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Cancel")}
          style={[StyleSheet.absoluteFill, { backgroundColor: tokens.overlay }]}
          onPress={() => close()}
        />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        accessibilityViewIsModal
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          {
            backgroundColor: tokens.sheet,
            paddingBottom: Math.max(insets.bottom, 16),
            opacity: height ? 1 : 0,
            transform: settled
              ? []
              : [
                  {
                    translateY: Animated.add(
                      shown.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }),
                      drag,
                    ),
                  },
                ],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: tokens.fileIconGlyph }]} />
        <MessageMenuContent menu={menu} onSelect={close} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    paddingTop: 30.5,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 52,
    borderBottomRightRadius: 52,
    borderCurve: "continuous",
  },
  grabber: {
    position: "absolute",
    top: 5,
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
});

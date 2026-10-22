import { StyleSheet } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { transparentColor } from "../lib/color";
import { HEADER_CONTROL_SIZE } from "../lib/native-controls";

export function createThreadHeaderStyles() {
  const tokens = mobileTokens();
  const transparentBackground = transparentColor(tokens.background);
  return StyleSheet.create({
    titleCapsule: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      maxWidth: 220,
      minHeight: HEADER_CONTROL_SIZE,
      paddingLeft: 9,
      paddingRight: 11,
      borderRadius: 999,
    },
    titleCapsuleFill: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.glassStroke,
      backgroundColor: tokens.glassFill,
    },
    title: {
      color: tokens.foreground,
      fontSize: 17,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
    },
    circleButton: {
      flex: 1,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    composerFill: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.glassStroke,
      backgroundColor: tokens.glassFill,
    },
    // Messages stay visible under the header and fade out toward the top edge.
    headerFade: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      experimental_backgroundImage: `linear-gradient(to bottom, ${tokens.background}D9 0%, ${transparentBackground} 100%)`,
    },
    // Messages fade out over the bottom edge, behind a floating control such as a pill.
    bottomFade: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      experimental_backgroundImage: `linear-gradient(to top, ${tokens.background} 0%, ${tokens.background} 20%, ${tokens.background}B3 55%, ${transparentBackground} 100%)`,
    },
    composerFade: {
      position: "absolute",
      bottom: "100%",
      left: -20,
      right: -20,
      height: 24,
      experimental_backgroundImage: `linear-gradient(to top, ${tokens.background} 0%, ${transparentBackground} 100%)`,
    },
  });
}

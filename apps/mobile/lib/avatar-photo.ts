import type * as ImageManipulatorModule from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { requireOptionalNativeModule } from "expo-modules-core";

/** Matches the web Avatar Studio: a square 256 px picture, small enough for the bot list. */
const AVATAR_EDGE = 256;

/** Lets the user crop a library photo to a square; resolves to a data URL, or null if cancelled. */
export async function pickAvatarPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (!requireOptionalNativeModule("ExpoImageManipulator")) throw new Error("No image manipulator");
  const manipulator = require("expo-image-manipulator") as typeof ImageManipulatorModule;
  const context = manipulator.ImageManipulator.manipulate(asset.uri);
  context.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    base64: true,
    compress: 0.8,
    format: manipulator.SaveFormat.JPEG,
  });
  if (!saved.base64) throw new Error("No image data");
  return `data:image/jpeg;base64,${saved.base64}`;
}

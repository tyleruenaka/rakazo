import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  addNotificationServiceTarget,
  applyCommunicationEntitlement,
  applyEasAppExtension,
  applyMessageActivity,
  NOTIFICATION_SERVICE_TARGET,
} from "./with-notification-service.js";

const require = createRequire(import.meta.url);
const expoPackage = require.resolve("expo/package.json");
const configPlugins = createRequire(expoPackage).resolve("@expo/config-plugins/package.json");
// The same `xcode` package Expo's withXcodeProject hands the plugin.
const xcode = createRequire(configPlugins)("xcode");
const expoTemplateTgz = join(dirname(expoPackage), "template.tgz");
const TEMPLATE = execFileSync(
  "tar",
  ["-xOf", expoTemplateTgz, "package/ios/HelloWorld.xcodeproj/project.pbxproj"],
  { encoding: "utf8" },
);

const dir = mkdtempSync(join(tmpdir(), "rakazo-nse-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function parse(text) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.pbxproj`);
  writeFileSync(file, text);
  return xcode.project(file).parseSync();
}

const unquote = (value) => String(value).replace(/^"|"$/g, "");

function withExtension() {
  const project = parse(TEMPLATE);
  addNotificationServiceTarget(project, { bundleIdentifier: "com.example.app", teamId: "TEAM123" });
  // Round-trip through text so the result is what Xcode will read.
  return parse(project.writeSync());
}

function settingsOf(project, target) {
  const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const configurations = project.pbxXCBuildConfigurationSection();
  return list.buildConfigurations.map(({ value }) => configurations[value].buildSettings);
}

describe("addNotificationServiceTarget", () => {
  it("adds a notification service extension the app builds and embeds", () => {
    const project = withExtension();
    const objects = project.hash.project.objects;
    const extension = project.pbxTargetByName(JSON.stringify(NOTIFICATION_SERVICE_TARGET));
    expect(unquote(extension.productType)).toBe("com.apple.product-type.app-extension");

    for (const settings of settingsOf(project, extension)) {
      expect(unquote(settings.PRODUCT_BUNDLE_IDENTIFIER)).toBe(
        "com.example.app.NotificationService",
      );
      expect(settings.INFOPLIST_FILE).toBe("RakazoNotificationService/Info.plist");
      expect(settings.DEVELOPMENT_TEAM).toBe("TEAM123");
      expect(settings.CODE_SIGN_STYLE).toBe("Automatic");
      expect(String(settings.IPHONEOS_DEPLOYMENT_TARGET)).toBe("16.4");
    }

    // Sources compile the two Swift files from the extension's group.
    const phaseOf = (target, isa) =>
      target.buildPhases
        .map(({ value }) => objects[isa]?.[value])
        .find((phase) => phase !== undefined);
    const sources = phaseOf(extension, "PBXSourcesBuildPhase");
    expect(sources.files.map(({ comment }) => comment.replace(/"/g, "")).sort()).toEqual([
      "NotificationService.swift in Sources",
      "PushSender.swift in Sources",
    ]);
    const group = Object.values(objects.PBXGroup).find(
      (entry) => entry?.name === NOTIFICATION_SERVICE_TARGET,
    );
    const groupRefs = new Set(group.children.map(({ value }) => value));
    for (const { value } of sources.files) {
      expect(groupRefs.has(objects.PBXBuildFile[value].fileRef)).toBe(true);
    }

    // The version script runs after the extension's Info.plist is written.
    const script = phaseOf(extension, "PBXShellScriptBuildPhase");
    expect(script.inputPaths).toContain('"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"');
    expect(script.alwaysOutOfDate).toBe(1);
    expect(unquote(script.shellScript)).toContain('app=\\"$SRCROOT/HelloWorld/Info.plist\\"');

    // The app depends on the extension and copies it into PlugIns right after its resources.
    const app = project.pbxTargetByName("HelloWorld");
    expect(app.dependencies).toHaveLength(1);
    const appPhases = app.buildPhases.map(({ comment }) => comment);
    expect(appPhases.indexOf("Embed Foundation Extensions")).toBe(
      appPhases.indexOf("Resources") + 1,
    );
    const embed = phaseOf(app, "PBXCopyFilesBuildPhase");
    expect(embed.dstSubfolderSpec).toBe(13);
    expect(embed.files).toHaveLength(1);
    expect(embed.files[0].comment).toMatch(/^RakazoNotificationService\.appex in /);
  });

  it("writes no placeholder values and no stray build files", () => {
    const project = parse(TEMPLATE);
    addNotificationServiceTarget(project, { bundleIdentifier: "com.example.app" });
    const text = project.writeSync();
    expect(text).not.toContain("undefined");
    expect(text).not.toMatch(/Info\.plist in /);
  });

  it("adds the extension only once", () => {
    const project = withExtension();
    addNotificationServiceTarget(project, { bundleIdentifier: "com.example.app" });
    const targets = Object.values(project.hash.project.objects.PBXNativeTarget).filter(
      (entry) => typeof entry === "object",
    );
    expect(targets.map((target) => unquote(target.name)).sort()).toEqual([
      "HelloWorld",
      NOTIFICATION_SERVICE_TARGET,
    ]);
  });
});

describe("app settings for communication notifications", () => {
  it("turns on the entitlement and declares INSendMessageIntent once", () => {
    expect(applyCommunicationEntitlement({ "aps-environment": "production" })).toEqual({
      "aps-environment": "production",
      "com.apple.developer.usernotifications.communication": true,
    });
    const once = applyMessageActivity({ NSUserActivityTypes: ["Other"] });
    expect(once.NSUserActivityTypes).toEqual(["Other", "INSendMessageIntent"]);
    expect(applyMessageActivity(once)).toBe(once);
  });

  it("tells EAS Build about the extension without dropping other settings", () => {
    const config = applyEasAppExtension(
      { name: "app", extra: { eas: { projectId: "p" }, other: 1 } },
      "com.example.app",
    );
    expect(config.extra.other).toBe(1);
    expect(config.extra.eas.projectId).toBe("p");
    expect(config.extra.eas.build.experimental.ios.appExtensions).toEqual([
      {
        targetName: NOTIFICATION_SERVICE_TARGET,
        bundleIdentifier: "com.example.app.NotificationService",
        entitlements: {},
      },
    ]);
    expect(
      applyEasAppExtension(config, "com.example.app").extra.eas.build.experimental.ios
        .appExtensions,
    ).toHaveLength(1);
  });
});

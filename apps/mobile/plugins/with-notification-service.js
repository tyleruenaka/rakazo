const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

/**
 * iOS shows a bot's message the way messaging apps do: the bot's picture large with the app icon
 * in the corner (Communication Notifications). A Notification Service Extension fetches the
 * picture when a push marked `mutableContent` arrives; the app itself needs the communication
 * notifications entitlement and must declare that it handles INSendMessageIntent.
 */
const TARGET = "RakazoNotificationService";
const BUNDLE_SUFFIX = "NotificationService";
const SOURCE_DIR = path.join(__dirname, "notification-service");
const SWIFT_FILES = ["NotificationService.swift", "PushSender.swift"];
const FILES = [...SWIFT_FILES, "Info.plist"];
const COMMUNICATION_ENTITLEMENT = "com.apple.developer.usernotifications.communication";
const MESSAGE_ACTIVITY = "INSendMessageIntent";

function applyCommunicationEntitlement(entitlements) {
  return { ...entitlements, [COMMUNICATION_ENTITLEMENT]: true };
}

function applyMessageActivity(infoPlist) {
  const types = infoPlist.NSUserActivityTypes ?? [];
  if (types.includes(MESSAGE_ACTIVITY)) return infoPlist;
  return { ...infoPlist, NSUserActivityTypes: [...types, MESSAGE_ACTIVITY] };
}

/** One-line shell: the extension must carry the app's exact version and build number. */
function versionScript(appInfoPlist) {
  return [
    "set -eu",
    `app="$SRCROOT/${appInfoPlist}"`,
    'ext="$TARGET_BUILD_DIR/$INFOPLIST_PATH"',
    "for key in CFBundleShortVersionString CFBundleVersion; do " +
      'value=$(/usr/libexec/PlistBuddy -c "Print :$key" "$app"); ' +
      "case \"$value\" in *'$('*) ;; *) " +
      '/usr/libexec/PlistBuddy -c "Set :$key $value" "$ext" ;; esac; done',
  ].join("; ");
}

function buildSettingsOf(project, target) {
  const lists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const list = lists[target.buildConfigurationList];
  return (list?.buildConfigurations ?? []).map(({ value }) => configurations[value].buildSettings);
}

/**
 * The `xcode` package writes unset file fields as the word "undefined" and gives the extension's
 * Info.plist a build file no phase uses. Xcode must read neither.
 */
function tidyNewReferences(objects, group) {
  for (const reference of Object.values(objects.PBXFileReference)) {
    if (typeof reference !== "object") continue;
    for (const key of Object.keys(reference)) {
      if (reference[key] === undefined) delete reference[key];
    }
  }
  const plist = group.pbxGroup.children.find(({ comment }) => comment === "Info.plist");
  for (const [key, file] of Object.entries(objects.PBXBuildFile)) {
    if (file?.fileRef === plist?.value) {
      delete objects.PBXBuildFile[key];
      delete objects.PBXBuildFile[`${key}_comment`];
    }
  }
}

/** Adds the extension target to a parsed Xcode project (the `xcode` package's model). */
function addNotificationServiceTarget(project, { bundleIdentifier, teamId }) {
  // `addTarget` stores the name quoted, so look for both spellings.
  if (project.pbxTargetByName(TARGET) || project.pbxTargetByName(JSON.stringify(TARGET))) {
    return project;
  }
  const objects = project.hash.project.objects;
  // Expo's template has none yet; `addTarget` writes the app's dependency on the extension here.
  objects.PBXTargetDependency = objects.PBXTargetDependency ?? {};
  objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {};

  const app = project.getFirstTarget();
  const appSettings = buildSettingsOf(project, app.firstTarget)[0] ?? {};
  const appInfoPlist = String(appSettings.INFOPLIST_FILE ?? "").replace(/"/g, "");
  if (!appInfoPlist) throw new Error("with-notification-service: the app has no INFOPLIST_FILE.");

  const group = project.addPbxGroup(FILES, TARGET, TARGET);
  project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
  const target = project.addTarget(
    TARGET,
    "app_extension",
    TARGET,
    `${bundleIdentifier}.${BUNDLE_SUFFIX}`,
  );
  project.addBuildPhase(SWIFT_FILES, "PBXSourcesBuildPhase", "Sources", target.uuid);
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
  const script = project.addBuildPhase(
    [],
    "PBXShellScriptBuildPhase",
    "Match the app version",
    target.uuid,
    {
      shellPath: "/bin/sh",
      shellScript: versionScript(appInfoPlist),
      // Runs after Xcode writes the extension's Info.plist.
      inputPaths: ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"', `"$(SRCROOT)/${appInfoPlist}"`],
    },
  );
  // Every build: the app's version can change without any input file changing.
  script.buildPhase.alwaysOutOfDate = 1;

  // Embed the extension before the app's script phases; after them Xcode reports a build cycle.
  const phases = objects.PBXNativeTarget[app.uuid].buildPhases;
  const copy = phases.findIndex((phase) => phase.comment === "Copy Files");
  if (copy < 0) throw new Error("with-notification-service: the extension was not embedded.");
  const [embed] = phases.splice(copy, 1);
  embed.comment = "Embed Foundation Extensions";
  objects.PBXCopyFilesBuildPhase[`${embed.value}_comment`] = embed.comment;
  objects.PBXCopyFilesBuildPhase[embed.value].name = `"${embed.comment}"`;
  const resources = phases.findIndex((phase) => phase.comment === "Resources");
  phases.splice(resources + 1, 0, embed);

  tidyNewReferences(objects, group);

  for (const settings of buildSettingsOf(project, target.pbxNativeTarget)) {
    Object.assign(settings, {
      INFOPLIST_FILE: `${TARGET}/Info.plist`,
      CODE_SIGN_STYLE: "Automatic",
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: appSettings.TARGETED_DEVICE_FAMILY ?? '"1,2"',
      IPHONEOS_DEPLOYMENT_TARGET: appSettings.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4",
      MARKETING_VERSION: appSettings.MARKETING_VERSION ?? "1.0",
      CURRENT_PROJECT_VERSION: appSettings.CURRENT_PROJECT_VERSION ?? "1",
      APPLICATION_EXTENSION_API_ONLY: "YES",
      CLANG_ENABLE_MODULES: "YES",
      ENABLE_USER_SCRIPT_SANDBOXING: "NO",
      ...(teamId ? { DEVELOPMENT_TEAM: teamId } : {}),
    });
  }
  if (teamId) project.addTargetAttribute("DevelopmentTeam", teamId, target);
  return project;
}

/** Tells EAS Build to provision the extension too (bundle id and entitlements). */
function applyEasAppExtension(config, bundleIdentifier) {
  const extra = config.extra ?? {};
  const eas = extra.eas ?? {};
  const build = eas.build ?? {};
  const experimental = build.experimental ?? {};
  const ios = experimental.ios ?? {};
  const extensions = (ios.appExtensions ?? []).filter((entry) => entry.targetName !== TARGET);
  return {
    ...config,
    extra: {
      ...extra,
      eas: {
        ...eas,
        build: {
          ...build,
          experimental: {
            ...experimental,
            ios: {
              ...ios,
              appExtensions: [
                ...extensions,
                {
                  targetName: TARGET,
                  bundleIdentifier: `${bundleIdentifier}.${BUNDLE_SUFFIX}`,
                  entitlements: {},
                },
              ],
            },
          },
        },
      },
    },
  };
}

const withNotificationService = (config) => {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) throw new Error("with-notification-service: set ios.bundleIdentifier.");
  config = applyEasAppExtension(config, bundleIdentifier);
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults = applyCommunicationEntitlement(cfg.modResults);
    return cfg;
  });
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = applyMessageActivity(cfg.modResults);
    return cfg;
  });
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const destination = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(destination, { recursive: true });
      for (const file of FILES) {
        fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(destination, file));
      }
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    addNotificationServiceTarget(cfg.modResults, {
      bundleIdentifier,
      teamId: cfg.ios?.appleTeamId,
    });
    return cfg;
  });
};

module.exports = withNotificationService;
module.exports.addNotificationServiceTarget = addNotificationServiceTarget;
module.exports.applyCommunicationEntitlement = applyCommunicationEntitlement;
module.exports.applyMessageActivity = applyMessageActivity;
module.exports.applyEasAppExtension = applyEasAppExtension;
module.exports.NOTIFICATION_SERVICE_TARGET = TARGET;

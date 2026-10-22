import type { ConfigContext, ExpoConfig } from "expo/config";

const RELEASE_PROFILES = new Set(["production", "android-apk"]);

export default ({ config }: ConfigContext): ExpoConfig => {
  if (RELEASE_PROFILES.has(process.env.EAS_BUILD_PROFILE ?? "")) {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must be set in the EAS production environment before building a release.",
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error("EXPO_PUBLIC_API_URL must be a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_API_URL must use HTTPS for production builds.");
    }
  }

  let result = config as ExpoConfig;
  const rpId = passkeyRpId(process.env.EXPO_PUBLIC_API_URL);
  if (rpId) {
    // Native passkeys only work for domains the binary is associated with, so the app reads the
    // same list at runtime to hide passkeys on other servers.
    result = {
      ...result,
      ios: {
        ...result.ios,
        associatedDomains: [...(result.ios?.associatedDomains ?? []), `webcredentials:${rpId}`],
      },
      extra: { ...result.extra, passkeyRpIds: [rpId] },
    };
  }

  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (googleServicesFile) {
    result = { ...result, android: { ...result.android, googleServicesFile } };
  }

  const appleTeamId = process.env.RAKAZO_APPLE_TEAM_ID;
  if (appleTeamId) result = { ...result, ios: { ...result.ios, appleTeamId } };

  const projectId = process.env.RAKAZO_EAS_PROJECT_ID;
  if (projectId) result = { ...result, extra: { ...result.extra, eas: { projectId } } };

  const updatesUrl = process.env.RAKAZO_UPDATES_URL;
  if (updatesUrl) result = { ...result, updates: { ...result.updates, url: updatesUrl } };

  const bundleIdentifier = process.env.RAKAZO_IOS_BUNDLE_ID;
  if (bundleIdentifier && bundleIdentifier !== result.ios?.bundleIdentifier) {
    result = { ...result, ios: { ...result.ios, bundleIdentifier } };
    // Another app's over-the-air updates would replace this copy's code, so a copy only takes
    // updates from a source of its own.
    if (!updatesUrl) result = { ...result, updates: { enabled: false } };
  }

  return result;
};

/** The default server's host when native passkeys can use it: HTTPS and a domain name. */
function passkeyRpId(apiUrl: string | undefined): string | null {
  let url: URL;
  try {
    url = new URL(apiUrl ?? "");
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !host.includes(".")) return null;
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host)) return null;
  return host;
}

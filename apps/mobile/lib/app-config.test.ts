import type { ConfigContext, ExpoConfig } from "expo/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import appConfig from "../app.config";

beforeEach(() => {
  vi.stubEnv("EAS_BUILD_PROFILE", "production");
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://app.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const config: ExpoConfig = {
  name: "Example",
  slug: "example",
  android: { package: "com.example.app", permissions: ["POST_NOTIFICATIONS"] },
  ios: { bundleIdentifier: "com.example.app" },
  extra: { example: true },
};

function context(config: ExpoConfig): ConfigContext {
  return { config, projectRoot: "/project", staticConfigPath: null, packageJsonPath: null };
}

const passkeys = {
  ios: { ...config.ios, associatedDomains: ["webcredentials:app.example.com"] },
  extra: { ...config.extra, passkeyRpIds: ["app.example.com"] },
};

describe("mobile app config", () => {
  it("loads the Firebase file path while preserving the existing config", () => {
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/build/google-services.json");

    expect(appConfig(context(config))).toEqual({
      ...config,
      ...passkeys,
      android: { ...config.android, googleServicesFile: "/build/google-services.json" },
    });
    expect(config.android).not.toHaveProperty("googleServicesFile");
  });

  it("leaves the config unchanged when no variable applies", () => {
    vi.stubEnv("EAS_BUILD_PROFILE", "development");
    vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
    vi.stubEnv("GOOGLE_SERVICES_JSON", undefined);
    const existing = {
      ...config,
      android: { ...config.android, googleServicesFile: "./custom-google-services.json" },
    };

    expect(appConfig(context(existing))).toBe(existing);
    expect(appConfig(context(config))).toBe(config);
  });

  it("adds Android config when none exists", () => {
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/build/google-services.json");
    const { android: _android, ...withoutAndroid } = config;

    expect(appConfig(context(withoutAndroid))).toEqual({
      ...withoutAndroid,
      ...passkeys,
      android: { googleServicesFile: "/build/google-services.json" },
    });
  });

  it("associates the default server's domain for passkeys and keeps other domains", () => {
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://App.Example.com:8443/api");
    const existing = { ...config, ios: { ...config.ios, associatedDomains: ["applinks:x.test"] } };

    expect(appConfig(context(existing))).toEqual({
      ...config,
      ios: {
        ...config.ios,
        associatedDomains: ["applinks:x.test", "webcredentials:app.example.com"],
      },
      extra: { ...config.extra, passkeyRpIds: ["app.example.com"] },
    });
  });

  it.each([
    "http://app.example.com",
    "https://localhost:3100",
    "https://192.168.1.20",
    "https://[::1]",
    "not a url",
  ])("skips passkey domains for %s", (url) => {
    vi.stubEnv("EAS_BUILD_PROFILE", "development");
    vi.stubEnv("EXPO_PUBLIC_API_URL", url);
    vi.stubEnv("GOOGLE_SERVICES_JSON", undefined);

    expect(appConfig(context(config))).toBe(config);
  });

  describe("a copy with its own bundle ID", () => {
    const upstream = { ...config, updates: { url: "https://updates.example.com/upstream" } };

    beforeEach(() => {
      vi.stubEnv("EAS_BUILD_PROFILE", "development");
      vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
      vi.stubEnv("RAKAZO_IOS_BUNDLE_ID", "com.example.copy");
      vi.stubEnv("RAKAZO_APPLE_TEAM_ID", "TEAM123456");
    });

    it("turns off the original app's updates", () => {
      expect(appConfig(context(upstream))).toEqual({
        ...config,
        ios: { ...config.ios, bundleIdentifier: "com.example.copy", appleTeamId: "TEAM123456" },
        updates: { enabled: false },
      });
    });

    it("takes updates only from its own source", () => {
      vi.stubEnv("RAKAZO_UPDATES_URL", "https://updates.example.com/copy");

      expect(appConfig(context(upstream))).toMatchObject({
        ios: { bundleIdentifier: "com.example.copy" },
        updates: { url: "https://updates.example.com/copy" },
      });
    });

    it("pushes through its own project without turning updates back on", () => {
      vi.stubEnv("RAKAZO_EAS_PROJECT_ID", "copy-project");

      expect(appConfig(context(upstream))).toMatchObject({
        extra: { example: true, eas: { projectId: "copy-project" } },
        updates: { enabled: false },
      });
    });

    it("keeps updates when the bundle ID is the original one", () => {
      vi.stubEnv("RAKAZO_IOS_BUNDLE_ID", "com.example.app");

      expect(appConfig(context(upstream)).updates).toEqual(upstream.updates);
    });
  });
});

#!/usr/bin/env node
// Prints the next TestFlight build number for an app: the highest build number App Store Connect
// has for it, plus one. Reads the App Store Connect API with a team API key (ES256 JWT).
//
// Env: ASC_KEY_PATH (.p8 file), ASC_KEY_ID, ASC_ISSUER_ID, ASC_BUNDLE_ID (ASC_API_BASE for dry runs).
// Prints only the number on stdout; exits non-zero with a message on stderr if anything fails.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const API = process.env.ASC_API_BASE ?? "https://api.appstoreconnect.apple.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function token({ keyPath, keyId, issuerId }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }),
  );
  const key = createPrivateKey(readFileSync(keyPath));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

async function get(url, jwt) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`App Store Connect returned ${response.status} for ${new URL(url).pathname}.`);
  }
  return response.json();
}

async function main() {
  const jwt = token({
    keyPath: requireEnv("ASC_KEY_PATH"),
    keyId: requireEnv("ASC_KEY_ID"),
    issuerId: requireEnv("ASC_ISSUER_ID"),
  });
  const bundleId = requireEnv("ASC_BUNDLE_ID");

  const apps = await get(
    `${API}/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId`,
    jwt,
  );
  const app = apps.data?.find((entry) => entry.attributes?.bundleId === bundleId);
  if (!app) throw new Error("No App Store Connect app has the given bundle id.");

  let highest = 0;
  let url = `${API}/v1/builds?filter[app]=${app.id}&fields[builds]=version&limit=200`;
  while (url) {
    const page = await get(url, jwt);
    for (const build of page.data ?? []) {
      const version = build.attributes?.version ?? "";
      if (!/^\d+$/.test(version)) {
        throw new Error(
          `Build number "${version}" is not a whole number; set build_number by hand.`,
        );
      }
      highest = Math.max(highest, Number(version));
    }
    url = page.links?.next ?? null;
  }
  if (highest === 0) throw new Error("App Store Connect lists no builds for this app.");
  console.log(String(highest + 1));
}

main().catch((error) => {
  console.error(`Could not read the latest TestFlight build number: ${error.message}`);
  process.exit(1);
});

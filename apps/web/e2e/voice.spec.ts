import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, rpc, signup } from "./helpers";

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["microphone"],
});

test("voice settings connect a key, speak a reply, and open a call", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });
  });
  const stamp = Date.now();
  const userName = `Voice ${stamp}`;
  await signup(page, `voice-${stamp}@rakazo.test`, "password12", userName);
  await completeOnboarding(page);

  const voice = page
    .getByTestId("composer-bar")
    .getByRole("button", { name: "Voice", exact: true });
  await expect(voice).toHaveCount(1);
  await expect(
    page
      .getByTestId("composer-bar")
      .getByRole("button", { name: "Start voice input", exact: true }),
  ).toHaveCount(1);
  await captureScreenshot(page, testInfo, "voice-composer");
  await voice.click();
  await expect(page.getByTestId("voice-settings")).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dictate", exact: true })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "voice-settings");
  await page.getByRole("button", { name: "Close voice settings" }).click();
  await expect(page.getByTestId("voice-settings")).toHaveCount(0);

  const preparedOff = await rpc<{ ready: boolean }>(page, "voice/prepare", {
    text: "Hello there.",
  });
  expect(preparedOff.ready).toBe(false);

  await openUserSettings(page, "voice");
  await expect(page.getByTestId("voice-settings")).toBeVisible();
  await page.getByRole("button", { name: /Scripted/ }).click();
  const apiKeyInput = page.getByPlaceholder(/Paste your API key/);
  await expect(apiKeyInput).toHaveAttribute("autocomplete", "new-password");
  await apiKeyInput.fill("fake-scripted-voice-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connected", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace key" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "voice-settings-connected");

  const spoken = page.waitForResponse(
    (response) => response.url().includes("/api/voice/speak") && response.ok(),
  );
  await page.getByRole("button", { name: "Hear a sample" }).click();
  const clip = await spoken;
  expect(clip.headers()["content-type"]).toContain("audio/mpeg");

  const credentials = await rpc<Array<{ hasKey: boolean; provider: string }>>(
    page,
    "voice/credentials",
    {},
  );
  expect(credentials).toEqual([expect.objectContaining({ hasKey: true, provider: "scripted" })]);
  expect(JSON.stringify(credentials)).not.toContain("fake-scripted-voice-key");

  await page.getByRole("button", { name: "Close voice settings" }).click();

  const composer = page.getByPlaceholder(/Message/);
  await composer.fill("say hello");
  await page.keyboard.press("Enter");
  // A reply can render more than one text bubble; speak the latest one from its hover actions.
  const speakRow = page
    .locator("[data-message-id]")
    .filter({ has: page.getByRole("button", { name: "Speak this reply" }) })
    .last();
  await expect(speakRow).toBeVisible({
    timeout: 30_000,
  });
  await speakRow.hover();
  const speakReply = speakRow.getByRole("button", { name: "Speak this reply" });

  const replySpoken = page.waitForResponse(
    (response) => response.url().includes("/api/voice/speak") && response.ok(),
  );
  await speakReply.click();
  await replySpoken;

  await openUserSettings(page, "voice");
  await expect(page.getByRole("button", { name: "Replace key" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close voice settings" }).click();

  await voice.click();
  const callBar = page.getByTestId("call-view");
  // Connecting is silent and lasts only until the microphone is granted, so go straight to listening.
  await expect(page.getByRole("button", { name: "Hang up" })).toBeVisible();
  await expect(callBar).toHaveAttribute("data-call-phase", "listening");
  await captureScreenshot(page, testInfo, "voice-call");
  await callBar.getByRole("button", { name: "Transcript" }).click();
  await expect(callBar.getByRole("log", { name: "Transcript" })).toBeVisible();
  await captureScreenshot(page, testInfo, "voice-call-transcript");
  await callBar.getByRole("button", { name: "Settings" }).click();
  await expect(callBar.getByRole("combobox", { name: "Voice" })).toBeVisible();
  await captureScreenshot(page, testInfo, "voice-call-settings");
  await page.getByRole("button", { name: "Hang up" }).click();
  await expect(callBar).toHaveCount(0);

  const mic = page.getByRole("button", { name: "Start voice input", exact: true });
  await mic.click();
  const chip = page.getByTestId("dictation-chip");
  await expect(chip).toBeVisible();
  await captureScreenshot(page, testInfo, "composer-mic-dictation");
  // Discard so the screenshot's recording never sends a chat message.
  await chip.press("Escape");
  await expect(chip).toHaveCount(0);
  await expect(mic).toBeVisible();

  await openUserSettings(page, "voice");
  const settings = page.getByTestId("voice-settings");
  await settings.getByPlaceholder(/Paste a replacement key/).fill("leftover-voice-key");
  await settings.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  await expect(settings.getByLabel("API key", { exact: true })).toHaveValue("");
  await expect(rpc<Array<{ provider: string }>>(page, "voice/credentials", {})).resolves.toEqual(
    [],
  );
});

test("voice settings take a self-hosted speech server by URL", async ({ page }, testInfo) => {
  const stamp = Date.now();
  await signup(page, `voice-local-${stamp}@rakazo.test`, "password12", `Voice Local ${stamp}`);
  await completeOnboarding(page);

  await openUserSettings(page, "voice");
  const settings = page.getByTestId("voice-settings");
  await expect(settings).toBeVisible();
  const selfHosted = settings.getByRole("button", { name: /Self-hosted/ });
  await expect(selfHosted).toBeVisible();
  await captureScreenshot(page, testInfo, "voice-settings-providers");
  await selfHosted.click();
  await expect(settings.getByLabel("API key", { exact: true })).toHaveAttribute(
    "placeholder",
    "Optional",
  );
  const connect = settings.getByRole("button", { name: "Connect", exact: true });
  await expect(connect).toBeDisabled();
  await captureScreenshot(page, testInfo, "voice-settings-self-hosted-empty");

  // Nothing listens on the discard port, so the server check fails without a network.
  await settings.getByLabel("Server URL", { exact: true }).fill("http://127.0.0.1:9");
  await settings.getByLabel("Speech model", { exact: true }).fill("kokoro");
  await settings.getByLabel("Transcription model", { exact: true }).fill("whisper-1");
  await expect(connect).toBeEnabled();
  await captureScreenshot(page, testInfo, "voice-settings-self-hosted");
  await connect.click();
  await expect(
    settings.getByText("Couldn't reach the speech server at http://127.0.0.1:9."),
  ).toBeVisible();

  const credentials = await rpc<unknown[]>(page, "voice/credentials");
  expect(credentials).toEqual([]);
});

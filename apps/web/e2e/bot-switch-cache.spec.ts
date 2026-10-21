import { expect, test } from "@playwright/test";
import { activeBotId, captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("switching back to a bot paints its last transcript, inert until fresh data lands", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `bot-switch-cache-${stamp}@rakazo.test`, "password12", "Switch Cache");
  await completeOnboarding(page);
  await page.goto("/app");
  await page.waitForURL(/\/app\/[^/]+$/);

  const chiefId = activeBotId(page);
  const helper = await rpc<{ id: string }>(page, "bots/create", {
    name: "Helper",
    title: "helper",
    description: "Helps.",
    instructions: "",
    notifyOnFinish: false,
    computerMode: "team",
  });
  await page.reload();
  await page.waitForURL(new RegExp(`/app/${chiefId}$`));

  const marker = `switch cache marker ${stamp}`;
  await page.getByPlaceholder(/Message/).fill(marker);
  await page.keyboard.press("Enter");
  const transcript = page.getByTestId("transcript");
  await expect(transcript.getByText(marker)).toBeVisible();

  const sidebar = page.locator("aside").first();
  await sidebar.getByRole("button", { name: /^Helper/ }).click();
  await page.waitForURL(new RegExp(`/app/${helper.id}$`));
  await expect(transcript.getByText(marker)).toHaveCount(0);

  // Hold every thread load: the revisit must paint from the cache, not the network.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rpc/threads/get", async (route) => {
    await held;
    await route.continue();
  });
  await sidebar.getByRole("button", { name: /^Chief/ }).click();
  await page.waitForURL(new RegExp(`/app/${chiefId}$`));
  await expect(transcript.getByText(marker)).toBeVisible();
  await expect(transcript.locator("..")).toHaveAttribute("inert", "");
  await captureScreenshot(page, testInfo, "bot-switch-cached-transcript");

  release();
  await expect(transcript.locator("..")).not.toHaveAttribute("inert");
  await expect(transcript.getByText(marker)).toBeVisible();
  await page.unroute("**/rpc/threads/get");
});

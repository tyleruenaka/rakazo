import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

test("account settings avatar style previews differ for robot and organic", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `avatar-style-${stamp}@rakazo.test`, "password12", "Avatar style QA");
  await completeOnboarding(page);

  const settings = await openUserSettings(page);
  const picker = settings.getByTestId("avatar-style-select");
  await expect(picker).toHaveText("Organic");
  await picker.click();

  const robot = page.getByTestId("avatar-style-robot");
  const organic = page.getByTestId("avatar-style-organic");
  await expect(robot).toBeVisible();
  await expect(organic).toBeVisible();
  await expect(organic).toHaveAttribute("aria-selected", "true");
  await expect(robot).toHaveAttribute("aria-selected", "false");
  await expect(robot.locator(".rakazo-bot-avatar")).toBeVisible();
  await expect(organic.locator(".rakazo-organic-avatar")).toBeVisible();
  await expect(robot.locator(".rakazo-organic-avatar")).toHaveCount(0);
  await expect(organic.locator(".rakazo-bot-avatar")).toHaveCount(0);

  const robotMarkup = await robot
    .locator("svg")
    .first()
    .evaluate((el) => el.outerHTML);
  const organicMarkup = await organic
    .locator("svg")
    .first()
    .evaluate((el) => el.outerHTML);
  expect(robotMarkup).not.toBe(organicMarkup);

  await captureScreenshot(page, testInfo, "account-avatars-style-previews");

  await robot.click();
  await expect(picker).toHaveText("Robot");
  await page.reload();
  const reopened = await openUserSettings(page);
  await expect(reopened.getByTestId("avatar-style-select")).toHaveText("Robot");
});

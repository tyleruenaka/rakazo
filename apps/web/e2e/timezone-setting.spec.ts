import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

test.use({ timezoneId: "Pacific/Auckland" });

test("account settings save avatar style and timezone, and offer this device's zone back", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `timezone-${stamp}@rakazo.test`, "password12", "Timezone QA");
  await completeOnboarding(page);

  const settings = await openUserSettings(page);

  // Avatar style previews differ for robot and organic.
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

  const select = settings.getByTestId("timezone-select");
  // First sign-in saves the browser's zone without asking.
  await expect(select).toHaveText("Pacific/Auckland");
  await select.click();
  await expect(page.getByRole("option", { name: /^Pacific\/Auckland/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("timezone-use-device")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Search timezone" }).fill("London");
  await page.getByRole("option", { name: /^Europe\/London/ }).click();
  await expect(select).toHaveText("Europe/London");
  await select.click();
  const useDevice = page.getByTestId("timezone-use-device");
  await expect(useDevice).toHaveText(/^Use Pacific\/Auckland/);
  await captureScreenshot(page, testInfo, "account-timezone-setting");
  await page.keyboard.press("Escape");

  // Saved choices survive a reload; the browser zone does not overwrite the timezone.
  await page.reload();
  const reopened = await openUserSettings(page);
  await expect(reopened.getByTestId("avatar-style-select")).toHaveText("Robot");
  const reopenedSelect = reopened.getByTestId("timezone-select");
  await expect(reopenedSelect).toHaveText("Europe/London");

  await reopenedSelect.click();
  await page.getByTestId("timezone-use-device").click();
  await expect(reopenedSelect).toHaveText("Pacific/Auckland");
  await reopenedSelect.click();
  await expect(page.getByRole("option", { name: /^Pacific\/Auckland/ })).toBeVisible();
  await expect(page.getByTestId("timezone-use-device")).toHaveCount(0);
});

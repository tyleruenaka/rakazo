import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, openUserSettings, signup } from "./helpers";

test.use({ timezoneId: "Pacific/Auckland" });

test("timezone setting adopts the browser zone, saves a choice, and offers this device's zone back", async ({
  page,
}, testInfo) => {
  const stamp = Date.now();
  await signup(page, `timezone-${stamp}@rakazo.test`, "password12", "Timezone QA");
  await completeOnboarding(page);

  const settings = await openUserSettings(page);
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

  // A saved choice survives a reload; the browser zone does not overwrite it.
  await page.reload();
  const reopened = await openUserSettings(page);
  const reopenedSelect = reopened.getByTestId("timezone-select");
  await expect(reopenedSelect).toHaveText("Europe/London");

  await reopenedSelect.click();
  await page.getByTestId("timezone-use-device").click();
  await expect(reopenedSelect).toHaveText("Pacific/Auckland");
  await reopenedSelect.click();
  await expect(page.getByRole("option", { name: /^Pacific\/Auckland/ })).toBeVisible();
  await expect(page.getByTestId("timezone-use-device")).toHaveCount(0);
});

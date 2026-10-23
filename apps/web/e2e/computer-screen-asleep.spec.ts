import { expect, test } from "@playwright/test";
import { activeBotId, captureScreenshot, completeOnboarding, rpc, signup } from "./helpers";

test("a computer with no free screen sleeps, wakes, and waits for one", async ({
  page,
}, testInfo) => {
  await signup(page, `screen-asleep-${Date.now()}@rakazo.test`, "password12", "Screen Asleep");
  await completeOnboarding(page);
  const botId = activeBotId(page);
  await rpc(page, "computer/boot", { botId });
  await expect(rpc<{ state: string }>(page, "computer/status", { botId })).resolves.toMatchObject({
    state: "running",
  });

  let screenFree = false;
  const wakes: boolean[] = [];
  const screenUrl = "https://screen.example/vnc.html";
  await page.route("https://screen.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Test desktop</title><p>Desktop connected</p>",
    }),
  );
  await page.route("**/rpc/computer/screenUrl", (route) => {
    wakes.push(route.request().postDataJSON()?.json?.wake === true);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        json: screenFree ? { url: screenUrl } : { url: null, unavailable: true },
      }),
    });
  });

  await page.getByRole("button", { name: "Agent computer", exact: true }).click();
  const preview = page.getByTestId("computer-preview");
  await expect(preview).toContainText("Computer is asleep. Open it to wake.");
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/'s screen · suspended$/)).toBeVisible();
  expect(wakes).not.toContain(true);
  await captureScreenshot(page, testInfo, "computer-screen-asleep");

  await preview.hover();
  await preview.getByTestId("computer-preview-open").click();
  const fullWindow = page.getByTestId("computer-screen-wake");
  await expect(fullWindow).toContainText("Waiting for a free screen…");
  expect(wakes).toContain(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await captureScreenshot(page, testInfo, "computer-screen-waiting");

  // The page's own bots refresh asks again, so the screen appears once one frees up.
  screenFree = true;
  await expect(page.locator('iframe[title="Bot screen"]')).toHaveAttribute("src", screenUrl);
  await expect(fullWindow).toHaveCount(0);
});

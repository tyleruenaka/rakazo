import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { completeOnboarding, signup } from "./helpers";

// Cached public catalog artwork keeps visual coverage offline and repeatable.
const apps = ["gmail", "notion", "github"];
test.use({ deviceScaleFactor: 3 });

for (const theme of ["light", "dark"]) {
  test(`connected app marks share a plate and separating ring in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((theme) => localStorage.setItem("rakazo.uiAppearance", theme), theme);
    for (const app of apps) {
      await page.route(`https://logos.composio.dev/api/${app}`, (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: readFileSync(new URL(`./fixtures/app-marks/${app}.svg`, import.meta.url)),
        }),
      );
    }
    await page.route("**/rpc/connections/catalog", (route) =>
      route.fulfill({
        json: {
          json: apps.map((slug) => ({
            connectorId: "composio",
            slug,
            name: slug,
            connected: true,
            noAuth: false,
            logo: `https://logos.composio.dev/api/${slug}`,
          })),
        },
      }),
    );
    await signup(page, `app-marks-${theme}-${Date.now()}@rakazo.test`, "password12", "Demo User");
    await completeOnboarding(page);
    const footer = page.getByTestId("sidebar-footer");
    const pill = footer.getByRole("button", { name: "Connect apps", exact: true });
    // Each mark is a ring tile holding the logo on the shared white plate.
    const tiles = pill.locator('span[aria-hidden="true"] > span');
    await expect(tiles).toHaveCount(3);
    const images = tiles.locator("img");
    await expect(images).toHaveCount(apps.length);
    for (const index of apps.keys()) {
      await expect
        .poll(() => images.nth(index).evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    for (const hover of [false, true]) {
      if (hover) await pill.hover();
      else await page.mouse.move(1000, 400);
      // The ring takes the pill color so it separates overlapping marks. The pill fades its
      // background, so wait until both colors settle and match.
      const background = (el: Element) => getComputedStyle(el).backgroundColor;
      let ring = "";
      await expect
        .poll(async () => {
          const [pillColor, ringColor] = await Promise.all([
            pill.evaluate(background),
            tiles.first().evaluate(background),
          ]);
          const settled = pillColor === ringColor && ringColor === ring;
          ring = ringColor;
          return settled;
        })
        .toBe(true);
      const marks = await tiles.evaluateAll((els) =>
        els.map((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          const plate = el.querySelector("img")!;
          return {
            x: box.x,
            y: box.y,
            width: el.offsetWidth,
            height: el.offsetHeight,
            ring: style.backgroundColor,
            padding: style.padding,
            plate: getComputedStyle(plate).backgroundColor,
          };
        }),
      );
      for (const [index, mark] of marks.entries()) {
        // Marks are 18px rounded squares with a 1px ring, overlapping by 6px.
        expect(mark).toMatchObject({
          width: 18,
          height: 18,
          padding: "1px",
          ring,
          plate: "rgb(255, 255, 255)",
        });
        expect(mark.ring).not.toBe("rgba(0, 0, 0, 0)");
        if (!hover) {
          expect(mark.y).toBe(marks[0]!.y);
          if (index) expect(mark.x - marks[index - 1]!.x).toBe(12);
        }
      }
      const path = testInfo.outputPath(`app-marks-${theme}${hover ? "-hover" : ""}.png`);
      await footer.screenshot({ path, animations: "disabled" });
      await testInfo.attach(`app-marks-${theme}${hover ? "-hover" : ""}`, {
        path,
        contentType: "image/png",
      });
    }
  });
}

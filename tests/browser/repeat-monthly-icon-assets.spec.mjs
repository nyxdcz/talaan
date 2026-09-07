import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

test("repeat monthly control uses replaceable PNG artwork and click bounce", async ({ page, request }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });

  for (const name of ["off", "on"]) {
    const response = await request.get(`http://127.0.0.1:3000/icons/repeat-monthly-${name}.png?v=2.5.0-talaan1`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"] || "").toContain("image/png");
    expect((await response.body()).byteLength).toBeGreaterThan(100);
  }

  await page.evaluate(() => {
    document.body.innerHTML = `
      <main id="money">
        <div class="record-row" data-expense-row>
          <div class="desktop-record-actions">
            <button class="button button-saved button-small repeat-icon-control" data-toggle-saved="example" aria-label="Repeat this expense monthly">
              <span class="saved-icon-container" aria-hidden="true"><span class="saved-icon">☆</span></span>
            </button>
          </div>
        </div>
      </main>`;
  });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/production-ui-audit.css?v=2.5.0-talaan1" });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/assets/js/ui/expense-compact.js" });

  const button = page.locator("[data-toggle-saved]");
  const container = button.locator(".saved-icon-container");
  const star = button.locator(".saved-icon");

  await expect(button.locator(".monthly-repeat-label")).toHaveCount(0);
  await expect(container).toHaveCSS("background-image", /repeat-monthly-off\.png/);
  await expect(star).toHaveCSS("opacity", "0");

  await button.evaluate(element => element.classList.add("active"));
  await expect(container).toHaveCSS("background-image", /repeat-monthly-on\.png/);

  await page.emulateMedia({ reducedMotion:"no-preference" });
  await button.click();
  await page.waitForTimeout(32);
  expect(await container.evaluate(node => node.getAnimations().some(animation => animation.playState === "running"))).toBe(true);

  await container.evaluate(node => node.getAnimations().forEach(animation => animation.cancel()));
  await page.emulateMedia({ reducedMotion:"reduce" });
  await button.click();
  await page.waitForTimeout(32);
  expect(await container.evaluate(node => node.getAnimations().length)).toBe(0);
});

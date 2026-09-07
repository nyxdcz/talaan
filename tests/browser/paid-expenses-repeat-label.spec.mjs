import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

test("paid expenses repeat controls stay icon-only, flat, and accessible", async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });

  await page.evaluate(() => {
    document.body.innerHTML = `
      <div id="paidExpenseList">
        <div class="record-actions desktop-record-actions">
          <button class="button button-saved button-small repeat-icon-control" data-toggle-saved="paid-example" title="Does not repeat monthly" aria-label="Repeat this expense monthly">
            <span class="saved-icon-container" aria-hidden="true"><span class="saved-icon">☆</span></span>
          </button>
          <button class="button button-secondary button-small" data-undo-paid="paid-example">Move to unpaid</button>
          <button class="button button-secondary button-small" data-edit-expense="paid-example">Edit</button>
        </div>
        <div class="mobile-record-actions">
          <button class="button button-secondary repeat-icon-control" role="menuitem" data-toggle-saved="paid-example-mobile" title="Does not repeat monthly" aria-label="Repeat this expense monthly">
            <span class="saved-icon-container" aria-hidden="true"><span class="saved-icon">☆</span></span>
          </button>
        </div>
      </div>`;
  });

  await page.addStyleTag({ url:"http://127.0.0.1:3000/production-ui-audit.css?v=2.5.0-talaan1" });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/assets/js/ui/expense-compact.js" });

  const desktopButton = page.locator("#paidExpenseList .desktop-record-actions [data-toggle-saved]");
  const icon = desktopButton.locator(".saved-icon-container");
  const star = desktopButton.locator(".saved-icon");

  await expect(desktopButton).toHaveCSS("height", "30px");
  await expect(icon).toHaveCSS("width", "30px");
  await expect(icon).toHaveCSS("height", "30px");
  await expect(icon).toHaveCSS("background-image", /repeat-monthly-off\.png/);
  await expect(star).toHaveCSS("opacity", "0");
  await expect(desktopButton.locator(".monthly-repeat-label")).toHaveCount(0);
  await expect(desktopButton).toHaveCSS("box-shadow", "none");
  await expect(desktopButton).toHaveCSS("border-radius", "12px");
  expect(await desktopButton.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(30, 0);
  await expect(desktopButton).toHaveAttribute("aria-label", "Repeat this expense monthly");
  await expect(desktopButton).toHaveAttribute("title", "Does not repeat monthly");

  await desktopButton.evaluate(element => element.classList.add("active"));
  await expect(icon).toHaveCSS("background-image", /repeat-monthly-on\.png/);

  await page.emulateMedia({ reducedMotion:"no-preference" });
  await desktopButton.click();
  await page.waitForTimeout(32);
  expect(await icon.evaluate(node => node.getAnimations().some(animation => animation.playState === "running"))).toBe(true);

  await expect(page.locator("#paidExpenseList .mobile-record-actions [data-toggle-saved]")).toHaveCount(1);
  await expect(page.locator("#paidExpenseList [data-undo-paid]")).toHaveText("Move to unpaid");
  await expect(page.locator("#paidExpenseList [data-edit-expense]")).toHaveText("Edit");

  await page.setViewportSize({ width:390, height:800 });
  const mobileRepeat = page.locator("#paidExpenseList .mobile-record-actions [data-toggle-saved]");
  await expect(mobileRepeat.locator(".monthly-repeat-label")).toHaveCount(0);
  await expect(mobileRepeat.locator(".saved-icon-container")).toHaveCSS("width", "30px");
  await expect(mobileRepeat.locator(".saved-icon-container")).toHaveCSS("height", "30px");
  await expect(mobileRepeat).toHaveAttribute("aria-label", "Repeat this expense monthly");
  await expect(mobileRepeat).toHaveAttribute("title", "Does not repeat monthly");
  await expect(mobileRepeat).toHaveCSS("height", "35px");
  await expect(mobileRepeat).toHaveCSS("box-shadow", "none");
  await expect(mobileRepeat).toHaveCSS("border-radius", "12px");
});

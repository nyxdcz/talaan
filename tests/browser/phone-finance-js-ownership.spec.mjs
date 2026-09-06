import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

const widths = [320, 360, 375, 390, 430];

for (const width of widths) {
  test(`Phone Finance compatibility module preserves icon actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"domcontentloaded" });

    const addAccount = page.locator("#addAccountButton");
    await expect(addAccount).toHaveClass(/phone-icon-only-action/);
    await expect(addAccount).toHaveAttribute("aria-label", "Add account");
    await expect(addAccount).toHaveAttribute("title", "Add account");
    await expect(addAccount.locator(".phone-only-action-icon")).toHaveCount(1);
    await expect(addAccount.locator(".phone-only-action-label")).toHaveCount(1);

    const state = await addAccount.evaluate(button => ({
      width:getComputedStyle(button).width,
      height:getComputedStyle(button).height,
      labelDisplay:getComputedStyle(button.querySelector(".phone-only-action-label")).display,
      iconDisplay:getComputedStyle(button.querySelector(".phone-only-action-icon")).display,
      bound:button.dataset.phoneCompactIconBound,
      script:[...document.scripts].some(script => String(script.src || "").includes("phone-finance-compat.js?v=2.5.0-talaan1"))
    }));

    expect(state.width).toBe("35px");
    expect(state.height).toBe("35px");
    expect(state.labelDisplay).toBe("none");
    expect(state.iconDisplay).toBe("grid");
    expect(state.bound).toBe("true");
    expect(state.script).toBe(true);
  });
}

test("dynamic Schedule event buttons are enhanced once and remain desktop-readable", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"domcontentloaded" });

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pcAdd = "true";
    button.textContent = "Schedule event";
    document.body.appendChild(button);
  });

  const schedule = page.locator("[data-pc-add]").last();
  await expect(schedule).toHaveClass(/phone-icon-only-action/);
  await expect(schedule).toHaveAttribute("aria-label", "Schedule event");
  await expect(schedule).toHaveAttribute("title", "Schedule event");
  await expect(schedule.locator(".phone-only-action-icon")).toHaveCount(1);
  await expect(schedule.locator(".phone-only-action-label")).toHaveCount(1);

  await page.evaluate(() => {
    const marker = document.createElement("span");
    marker.textContent = "mutation";
    document.body.appendChild(marker);
  });
  await expect(schedule.locator(".phone-only-action-icon")).toHaveCount(1);
  await expect(schedule.locator(".phone-only-action-label")).toHaveCount(1);

  await page.evaluate(() => {
    const second = document.createElement("button");
    second.type = "button";
    second.dataset.pcFullAdd = "true";
    second.textContent = "Schedule event";
    document.body.appendChild(second);
  });
  const fullSchedule = page.locator("[data-pc-full-add]").last();
  await expect(fullSchedule).toHaveClass(/phone-icon-only-action/);
  await expect(fullSchedule.locator(".phone-only-action-icon")).toHaveCount(1);
  await expect(fullSchedule.locator(".phone-only-action-label")).toHaveCount(1);

  await page.setViewportSize({ width:1024, height:800 });
  const desktop = await schedule.evaluate(button => ({
    labelDisplay:getComputedStyle(button.querySelector(".phone-only-action-label")).display,
    iconDisplay:getComputedStyle(button.querySelector(".phone-only-action-icon")).display,
    text:button.querySelector(".phone-only-action-label")?.textContent || ""
  }));
  expect(desktop.labelDisplay).not.toBe("none");
  expect(desktop.iconDisplay).toBe("none");
  expect(desktop.text).toContain("Schedule event");
});

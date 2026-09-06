import { test, expect } from "@playwright/test";

const phone = { width:390, height:844 };

test("phone Finance uses static compact record layout and icon-only Add account", async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"domcontentloaded" });

  await expect(page.locator("#phoneFinanceCompactV1522")).toHaveCount(0);
  const addAccount = page.locator("#addAccountButton");
  await expect(addAccount).toHaveClass(/phone-icon-only-action/);
  await expect(addAccount).toHaveAttribute("aria-label", "Add account");
  await expect(addAccount.locator(".phone-only-action-icon")).toHaveCount(1);
  await expect(addAccount.locator(".phone-only-action-label")).toHaveCount(1);

  const mobileState = await addAccount.evaluate(button => ({
    width:getComputedStyle(button).width,
    height:getComputedStyle(button).height,
    labelDisplay:getComputedStyle(button.querySelector(".phone-only-action-label")).display,
    iconDisplay:getComputedStyle(button.querySelector(".phone-only-action-icon")).display
  }));
  expect(mobileState.width).toBe("35px");
  expect(mobileState.height).toBe("35px");
  expect(mobileState.labelDisplay).toBe("none");
  expect(mobileState.iconDisplay).toBe("grid");

  await expect(page.locator('link[rel="stylesheet"][href*="mobile.css?v=2.5.0-talaan1"]')).toHaveCount(1);
});

test("dynamically rendered Schedule event becomes icon-only only at phone width", async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"domcontentloaded" });
  await expect(page.locator("#phoneFinanceCompactV1522")).toHaveCount(0);

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
  const phonePresentation = await schedule.evaluate(button => ({
    width:getComputedStyle(button).width,
    height:getComputedStyle(button).height,
    labelDisplay:getComputedStyle(button.querySelector(".phone-only-action-label")).display,
    iconDisplay:getComputedStyle(button.querySelector(".phone-only-action-icon")).display
  }));
  expect(phonePresentation.width).toBe("35px");
  expect(phonePresentation.height).toBe("35px");
  expect(phonePresentation.labelDisplay).toBe("none");
  expect(phonePresentation.iconDisplay).toBe("grid");

  await page.setViewportSize({ width:1024, height:800 });
  const desktopPresentation = await schedule.evaluate(button => ({
    labelDisplay:getComputedStyle(button.querySelector(".phone-only-action-label")).display,
    iconDisplay:getComputedStyle(button.querySelector(".phone-only-action-icon")).display,
    text:button.querySelector(".phone-only-action-label")?.textContent || ""
  }));
  expect(desktopPresentation.labelDisplay).not.toBe("none");
  expect(desktopPresentation.iconDisplay).toBe("none");
  expect(desktopPresentation.text).toContain("Schedule event");
});
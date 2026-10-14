import fs from "node:fs";
import { test, expect } from "../helpers/browser-fixtures.mjs";

test.use({ serviceWorkers:"block" });

test("More tools Appearance stays compact, left-aligned, and network-first", async ({ page }) => {
  const alignmentCss = fs.readFileSync("ui-icon-alignment.css", "utf8");
  const serviceWorker = fs.readFileSync("sw.js", "utf8");
  expect(alignmentCss).toContain("Final network-first More tools Appearance geometry");
  expect(alignmentCss).toContain("#themeToggleButton.topbar-tools-item.theme-toggle-button");
  expect(alignmentCss).toContain("justify-content:flex-start !important");
  expect(alignmentCss).toContain("height:38px !important");
  expect(alignmentCss).toContain("gap:6px !important");
  expect(serviceWorker).toContain('url.pathname.endsWith("ui-icon-alignment.css")');

  await page.setViewportSize({ width:1440, height:900 });
  await page.route("**/cloud-sync.js*", route => route.abort());
  await page.goto("http://127.0.0.1:3000/index.html?page=dashboard", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.FinancePrivacyLock?.unlock === "function" && Boolean(document.getElementById("topbarToolsTrigger")));
  await page.evaluate(() => window.FinancePrivacyLock.unlock({ email:"theme-alignment-test@example.invalid" }));
  await page.waitForFunction(() => {
    const panel = document.getElementById("topbarToolsPanel");
    const search = document.getElementById("globalSearchButton");
    const redo = document.getElementById("redoMoneyMenuButton");
    const quickActions = document.getElementById("productivityCenterButton");
    if (!panel || !search || search.parentElement !== panel || search.getAttribute("role") !== "menuitem") return false;
    if (redo && redo.nextElementSibling !== search) return false;
    if (quickActions?.parentElement === panel && search.nextElementSibling !== quickActions) return false;
    return true;
  });
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
  await page.locator("#topbarToolsTrigger").click();
  await expect(page.locator("#topbarToolsPanel")).toBeVisible();
  const appearanceButton = page.locator("#themeToggleButton");
  const searchButton = page.locator("#globalSearchButton");
  await expect(appearanceButton).toBeVisible();
  await expect(searchButton).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const appearanceIcon = document.querySelector("#themeToggleButton > .toolbar-icon");
    const searchIcon = document.querySelector("#globalSearchButton > .toolbar-icon");
    if (!appearanceIcon || !searchIcon) return Infinity;
    return Math.abs(appearanceIcon.getBoundingClientRect().left - searchIcon.getBoundingClientRect().left);
  })).toBeLessThanOrEqual(1);

  const layout = await appearanceButton.evaluate(button => {
    const icon = button.querySelector(":scope > .toolbar-icon");
    const textWrap = button.querySelector(":scope > span:last-child");
    const label = button.querySelector("#themeToggleText");
    const hiddenHeading = textWrap?.querySelector("strong");
    const searchIcon = document.querySelector("#globalSearchButton > .toolbar-icon");
    if (!icon || !textWrap || !label || !hiddenHeading || !searchIcon) throw new Error("More tools Appearance structure is incomplete");
    const buttonStyle = getComputedStyle(button);
    const wrapStyle = getComputedStyle(textWrap);
    const labelStyle = getComputedStyle(label);
    const headingStyle = getComputedStyle(hiddenHeading);
    const buttonRect = button.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const searchIconRect = searchIcon.getBoundingClientRect();
    return {
      buttonDisplay:buttonStyle.display,
      buttonAlign:buttonStyle.alignItems,
      buttonJustify:buttonStyle.justifyContent,
      buttonGap:buttonStyle.gap,
      buttonHeight:buttonRect.height,
      buttonPaddingLeft:buttonStyle.paddingLeft,
      wrapDisplay:wrapStyle.display,
      wrapAlign:wrapStyle.alignItems,
      labelDisplay:labelStyle.display,
      labelHeight:labelRect.height,
      iconWidth:iconRect.width,
      iconHeight:iconRect.height,
      centerDelta:Math.abs((iconRect.top + iconRect.height / 2) - (labelRect.top + labelRect.height / 2)),
      horizontalGap:labelRect.left - iconRect.right,
      iconLeftDelta:Math.abs(iconRect.left - searchIconRect.left),
      headingDisplay:headingStyle.display
    };
  });

  expect(layout.buttonDisplay).toBe("flex");
  expect(layout.buttonAlign).toBe("center");
  expect(layout.buttonJustify).toBe("flex-start");
  expect(layout.buttonGap).toBe("6px");
  expect(layout.buttonHeight).toBe(38);
  expect(layout.buttonPaddingLeft).toBe("10px");
  expect(layout.wrapDisplay).toBe("flex");
  expect(layout.wrapAlign).toBe("center");
  expect(layout.labelDisplay).toBe("flex");
  expect(layout.iconWidth).toBe(20);
  expect(layout.iconHeight).toBe(20);
  expect(layout.labelHeight).toBe(20);
  expect(layout.centerDelta).toBeLessThanOrEqual(1);
  expect(layout.horizontalGap).toBeCloseTo(6, 1);
  expect(layout.iconLeftDelta).toBeLessThanOrEqual(1);
  expect(layout.headingDisplay).toBe("none");

  for (const [preference, expected] of [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]]) {
    await page.evaluate(value => {
      document.documentElement.dataset.themePreference = value;
      document.documentElement.dataset.theme = value === "dark" ? "dark" : "light";
    }, preference);
    const generated = await page.locator("#themeToggleText").evaluate(element => {
      const content = getComputedStyle(element, "::after").content;
      return content && content !== "none" ? content.slice(1, -1) : "";
    });
    expect(generated).toBe(expected);
  }
});

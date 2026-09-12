import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000";
const ROUTES = ["dashboard", "money", "projects", "reports"];
const WIDTHS = [320, 393, 447];

async function openAuthenticated(page, route, width) {
  await page.setViewportSize({ width, height:852 });
  await page.goto(`${APP_URL}/?page=${route}`, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.waitForFunction(() => !document.body.classList.contains("finance-auth-pending"));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("body")).toHaveClass(/finance-signed-in/);
}

test("phone headers use the reference control order on every workspace page", async ({ page }) => {
  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      await openAuthenticated(page, route, width);

      const geometry = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
        const visibleMonthStatus = document.querySelector("#currentMonthButton:not([hidden]), #monthStatusChip:not([hidden])");
        const topbar = document.querySelector(".topbar");
        const monthNavigator = document.querySelector(".month-navigator");
        const cloud = document.querySelector("#cloudSyncStatusButton");
        const controls = [
          rect("#menuButton"),
          rect("#previousMonthButton"),
          rect("#monthControl"),
          rect("#nextMonthButton"),
          visibleMonthStatus?.getBoundingClientRect(),
          rect("#cloudSyncStatusButton"),
          rect("#topbarToolsTrigger")
        ];
        const allInside = controls.every(item => item && item.left >= -1 && item.right <= innerWidth + 1);
        const ordered = controls.every((item, index) => index === 0 || item.left > controls[index - 1].left);
        const height = selector => Math.round((rect(selector)?.height || 0) * 100) / 100;
        return {
          areas:getComputedStyle(topbar).gridTemplateAreas,
          monthArea:getComputedStyle(monthNavigator).gridArea,
          cloudArea:getComputedStyle(cloud).gridArea,
          toolsArea:getComputedStyle(document.querySelector("#topbarToolsMenu")).gridArea,
          titleRowArea:getComputedStyle(document.querySelector(".topbar-left")).gridArea,
          cloudDisplay:getComputedStyle(cloud).display,
          toolsDisplay:getComputedStyle(document.querySelector("#topbarToolsMenu")).display,
          titleDisplay:getComputedStyle(document.querySelector(".topbar-left > div")).display,
          controlHeights:controls.map(item => Math.round((item?.height || 0) * 100) / 100),
          toolsHeight:height("#topbarToolsTrigger"),
          allInside,
          ordered,
          pageOverflow:document.documentElement.scrollWidth > innerWidth + 1
        };
      });

      expect(geometry.areas).toContain("menu month month month month sync tools");
      expect(geometry.titleRowArea).toBe("menu");
      expect(geometry.monthArea).toBe("month");
      expect(geometry.cloudArea).toBe("sync");
      expect(geometry.toolsArea).toBe("tools");
      expect(geometry.cloudDisplay).toBe("grid");
      expect(geometry.toolsDisplay).toBe("block");
      expect(geometry.titleDisplay).toBe("none");
      expect(geometry.controlHeights).toEqual([35, 35, 35, 35, 35, 35, 35]);
      expect(geometry.toolsHeight).toBe(35);
      expect(geometry.allInside).toBe(true);
      expect(geometry.ordered).toBe(true);
      expect(geometry.pageOverflow).toBe(false);
    }
  }
});

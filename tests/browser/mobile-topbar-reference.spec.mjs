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
        const topbar = document.querySelector(".topbar");
        const monthNavigator = document.querySelector(".month-navigator");
        const cloud = document.querySelector("#cloudSyncStatusButton");
        const controls = [
          rect("#menuButton"),
          rect("#previousMonthButton"),
          rect("#monthControl"),
          rect("#nextMonthButton"),
          rect("#cloudSyncStatusButton"),
          rect("#topbarToolsTrigger")
        ];
        const allInside = controls.every(item => item && item.left >= -1 && item.right <= innerWidth + 1);
        const ordered = controls[1].right <= controls[2].left && controls[2].right <= controls[3].left && controls[1].top > controls[0].top;
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

      expect(geometry.areas).toBe("none");
      expect(geometry.monthArea).toBe("2 / 1 / auto / -1");
      expect(geometry.cloudArea).toBe("1 / 3");
      expect(geometry.toolsArea).toBe("1 / 4");
      expect(geometry.cloudDisplay).toBe("grid");
      expect(geometry.toolsDisplay).toBe("block");
      expect(geometry.titleDisplay).toBe("block");
      expect(geometry.controlHeights).toEqual([44, 44, 44, 44, 44, 44]);
      expect(geometry.toolsHeight).toBe(44);
      expect(geometry.allInside).toBe(true);
      expect(geometry.ordered).toBe(true);
      expect(geometry.pageOverflow).toBe(false);
    }
  }
});

import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000";
const IPHONE_14_PRO = { width:393, height:852 };

async function openAuthenticatedSettings(page) {
  await page.setViewportSize(IPHONE_14_PRO);
  await page.goto(`${APP_URL}/?page=settings`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#settings")).toHaveClass(/active/);
}

async function visibleSettingsContract(page) {
  return page.evaluate(() => {
    const root = document.getElementById("settings");
    const visible = node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const interactive = [...root.querySelectorAll('button, summary, [role="tab"]')]
      .filter(node => visible(node) && !node.disabled && !node.classList.contains("settings-status-card"))
      .map(node => {
        const rect = node.getBoundingClientRect();
        return {
          id:node.id || "",
          text:(node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70),
          tag:node.tagName.toLowerCase(),
          height:rect.height,
          width:rect.width,
          left:rect.left,
          right:rect.right
        };
      });
    return {
      interactive,
      undersized:interactive.filter(item => item.height < 34.5 || item.height > 35.5),
      outside:interactive.filter(item => item.left < -1 || item.right > innerWidth + 1),
      pageOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      viewport:{ width:innerWidth, height:innerHeight }
    };
  });
}

test("iPhone 14 Pro Settings sections keep 35px controls contained", async ({ page }) => {
  await openAuthenticatedSettings(page);

  const tabs = await page.locator("#settings [data-settings-tab]").evaluateAll(nodes => nodes.map(node => node.id).filter(Boolean));
  expect(tabs.length).toBeGreaterThan(0);

  const findings = [];
  for (const id of tabs) {
    await page.evaluate(tabId => document.getElementById(tabId)?.click(), id);
    await page.waitForTimeout(20);
    const contract = await visibleSettingsContract(page);
    if (contract.undersized.length || contract.outside.length || contract.pageOverflow) {
      findings.push({ tab:id, ...contract });
    }
  }

  expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
});
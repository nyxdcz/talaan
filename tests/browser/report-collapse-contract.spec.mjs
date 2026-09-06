import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/?page=reports";

async function openReports(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(APP_URL, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator("#reports")).toHaveClass(/active/);
  await expect(page.locator("#reports > .report-compact-group")).toHaveCount(7);
}

for (const contract of [{ width:1440, size:30 }, { width:390, size:35 }]) {
  test(`Monthly Reports disclosures use the ${contract.size}px contract at ${contract.width}px`, async ({ page }) => {
    await openReports(page, { width:contract.width, height:950 });
    const metrics = await page.locator("#reports > .report-compact-group").evaluateAll(groups => groups.map(group => {
      const chevron = group.querySelector(".report-compact-chevron");
      const icon = chevron.querySelector("svg");
      const box = chevron.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      return {
        open:group.open,
        width:box.width,
        height:box.height,
        radius:parseFloat(getComputedStyle(chevron).borderRadius),
        iconWidth:iconBox.width,
        iconHeight:iconBox.height,
        transform:getComputedStyle(chevron).transform,
        path:icon.querySelector("path")?.getAttribute("d") || ""
      };
    }));

    expect(metrics).toHaveLength(7);
    for (const metric of metrics) {
      expect(metric.width).toBeCloseTo(contract.size, 0);
      expect(metric.height).toBeCloseTo(contract.size, 0);
      expect(metric.radius).toBe(12);
      expect(metric.iconWidth).toBeCloseTo(20, 0);
      expect(metric.iconHeight).toBeCloseTo(20, 0);
      expect(metric.path).toBe("m6 15 6-6 6 6");
      if (metric.open) expect(metric.transform).toBe("none");
      else expect(metric.transform).not.toBe("none");
    }
  });
}

test("Monthly Reports sections preserve independent saved collapse states", async ({ page }) => {
  await openReports(page, { width:1440, height:950 });
  const summary = page.locator('[data-report-collapse-key="report-summary"]');
  const income = page.locator('[data-report-collapse-key="report-income"]');
  const expenses = page.locator('[data-report-collapse-key="report-expenses"]');

  await expect(summary).toHaveAttribute("open", "");
  await expect(income).not.toHaveAttribute("open", "");
  await summary.locator(":scope > summary").click();
  await income.locator(":scope > summary").click();
  await expect(summary).not.toHaveAttribute("open", "");
  await expect(income).toHaveAttribute("open", "");
  await expect(expenses).not.toHaveAttribute("open", "");

  await page.reload({ waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  await expect(page.locator('[data-report-collapse-key="report-summary"]')).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-report-collapse-key="report-income"]')).toHaveAttribute("open", "");
  await expect(page.locator('[data-report-collapse-key="report-expenses"]')).not.toHaveAttribute("open", "");
});

import { expect, test } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000/";
const FINANCE_PAGES = ["money", "income", "paid-expenses"];

test("all Finance pages use the same tabs-left marquee-right desktop row", async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto(APP_URL, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.FinanceInteractionPatterns));

  for (const pageId of FINANCE_PAGES) {
    const row = page.locator(`#${pageId} > .finance-workspace-marquee-row`);
    await expect(row).toHaveCount(1);

    const contract = await row.evaluate(node => {
      const switcher = node.querySelector(":scope > .money-workspace-switcher");
      const marquee = node.querySelector(":scope > .finance-week-marquee");
      return {
        childClasses:[...node.children].map(child => child.className),
        switcherHeight:switcher ? getComputedStyle(switcher).height : null,
        marqueeHeight:marquee ? getComputedStyle(marquee).height : null,
        marqueeRadius:marquee ? getComputedStyle(marquee).borderRadius : null,
        dayRadius:marquee && marquee.querySelector(".dashboard-week-day") ? getComputedStyle(marquee.querySelector(".dashboard-week-day")).borderRadius : null
      };
    });

    expect(contract.childClasses[0]).toContain("money-workspace-switcher");
    expect(contract.childClasses[1]).toContain("finance-week-marquee");
    expect(contract.switcherHeight).toBe("43px");
    expect(contract.marqueeHeight).toBe("43px");
    expect(contract.marqueeRadius).toBe("12px");
    expect(contract.dayRadius).toBe("8px");
  }
});

test("Finance weekly marquees remain disabled on phone", async ({ page }) => {
  await page.setViewportSize({ width:393, height:852 });
  await page.goto(APP_URL, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.FinanceInteractionPatterns));

  for (const pageId of FINANCE_PAGES) {
    const row = page.locator(`#${pageId} > .finance-workspace-marquee-row`);
    await expect(row).toHaveCount(1);
    const mobileContract = await row.evaluate(node => {
      const switcher = node.querySelector(":scope > .money-workspace-switcher");
      const marquee = node.querySelector(":scope > .finance-week-marquee");
      return {
        switcherPresent:Boolean(switcher),
        marqueeDisplay:marquee ? getComputedStyle(marquee).display : null
      };
    });
    expect(mobileContract.switcherPresent).toBe(true);
    expect(mobileContract.marqueeDisplay).toBe("none");
  }
});

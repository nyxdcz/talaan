import { test, expect } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`Talaan V2.5.0 appearance uses the expected ${theme} palette`, async ({ page }) => {
    await page.setViewportSize({ width:1440, height:900 });
    await page.setContent(`<!doctype html><html data-theme="${theme}"><head>
      <link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/shell-ui.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/black-canvas.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/desktop-ui-phase1.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/desktop-ux.css?v=2.5.0-talaan1">
      <link rel="stylesheet" href="http://127.0.0.1:3000/production-ui-audit.css?v=2.5.0-talaan1">
      <style>*,*::before,*::after{animation:none!important;transition:none!important}</style>
    </head><body>
      <button class="button button-paid" id="paid">Mark paid</button>
      <main id="money">
        <section id="availableMoneySection">
          <button class="button button-secondary button-small account-spend-button"><span id="spendLabel">Spend</span></button>
          <article class="account-card" id="accountCard">
            <div class="account-card-main">
              <div><div class="account-card-label"><span id="accountName">UnionBank</span><small id="accountType">Bank</small></div><strong id="accountAmount">₱3,140.00</strong></div>
            </div>
          </article>
        </section>
      </main>
    </body></html>`, { waitUntil:"load" });

    const expectedBg = theme === "light" ? "#efefef" : "#000000";
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe(expectedBg);

    const result = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const paidStyle = getComputedStyle(document.querySelector("#paid"));
      return {
        bg:root.getPropertyValue("--bg").trim(),
        primary:root.getPropertyValue("--primary").trim(),
        bodyBg:getComputedStyle(document.body).backgroundColor,
        paidBg:paidStyle.backgroundColor,
        paidBorder:paidStyle.borderTopColor,
        paidColor:paidStyle.color,
        spendColor:getComputedStyle(document.querySelector("#spendLabel")).color,
        accountBorder:getComputedStyle(document.querySelector("#accountCard")).borderTopColor,
        accountNameColor:getComputedStyle(document.querySelector("#accountName")).color,
        accountTypeColor:getComputedStyle(document.querySelector("#accountType")).color,
        accountAmountColor:getComputedStyle(document.querySelector("#accountAmount")).color
      };
    });

    if (theme === "light") {
      expect(result.bg).toBe("#efefef");
      expect(result.primary).toBe("#356FD1");
      expect(result.bodyBg).toBe("rgb(239, 239, 239)");
      expect(result.paidBg).toBe("rgb(53, 111, 209)");
      expect(result.paidBorder).toBe("rgb(53, 111, 209)");
      expect(result.accountBorder).not.toBe("rgba(207, 231, 213, 0.24)");
      expect(result.accountNameColor).toBe(result.accountAmountColor);
      expect(result.accountTypeColor).toBe("rgb(82, 96, 113)");
    } else {
      expect(result.bg).toBe("#000000");
      expect(result.primary).toBe("#356FD1");
      expect(result.bodyBg).toBe("rgb(0, 0, 0)");
      expect(result.paidBg).toBe("rgb(53, 111, 209)");
      expect(result.paidBorder).toBe("rgb(53, 111, 209)");
      expect(result.accountBorder).toBe("rgb(32, 41, 56)");
    }
    expect(result.paidColor).toBe("rgb(255, 255, 255)");
    expect(result.spendColor).toBe(theme === "light" ? "rgb(24, 34, 48)" : "rgb(255, 255, 255)");
  });
}

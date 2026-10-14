import { expect, test } from "../helpers/browser-fixtures.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const privacyScript = path.join(root, "privacy-lock.js");
const interactionScript = path.join(root, "interaction-patterns.js");
const appCss = read("app.css");
const shellUiCss = read("shell-ui.css");
const dashboardCss = read("dashboard-interactions.css");
const mobileCss = read("mobile.css");
const sourceHtml = read("index.html").replace("</head>", `<style>${appCss}\n${shellUiCss}\n${dashboardCss}\n${mobileCss}</style></head>`);
const testHtml = sourceHtml
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<script\b[^>]*\/?\s*>/gi, "")
  .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "");

async function loadStaticApp(page, viewport) {
  await page.setViewportSize(viewport);
  await page.setContent(testHtml, { waitUntil:"domcontentloaded" });
  await page.addScriptTag({ path:interactionScript });
  await page.evaluate(() => {
    window.__privacyNav = [];
    window.goToPage = pageId => window.__privacyNav.push(pageId);
    window.activateSettingsPanel = panel => window.__privacyNav.push(`settings:${panel}`);
    window.showToast = message => { window.__privacyToast = message; };
  });
}

for (const viewport of [{ width:1440, height:900 }, { width:393, height:852 }]) {
  test(`signed-out finance privacy stays locked at ${viewport.width}px`, async ({ page }) => {
    await loadStaticApp(page, viewport);
    await page.addScriptTag({ path:privacyScript });

    await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(false));
    const locked = await page.evaluate(() => {
      const money = document.getElementById("money");
      const fixture = document.createElement("button");
      fixture.textContent = "Mutate";
      let clicks = 0;
      fixture.addEventListener("click", () => { clicks += 1; });
      money.append(fixture);
      fixture.click();
      return {
        signedOut:document.body.classList.contains("finance-signed-out"),
        pending:document.body.classList.contains("finance-auth-pending"),
        privacyView:getComputedStyle(money.querySelector(":scope > .finance-privacy-lock-view")).display,
        underlying:getComputedStyle(money.querySelector(".page-heading")).display,
        zeros:[...money.querySelectorAll(".finance-privacy-lock-view strong")].map(node => node.textContent),
        mutationClicks:clicks,
        toast:window.__privacyToast || ""
      };
    });
    expect(locked.signedOut).toBe(true);
    expect(locked.pending).toBe(false);
    expect(locked.privacyView).not.toBe("none");
    expect(locked.underlying).toBe("none");
    expect(locked.zeros).toEqual(expect.arrayContaining(["₱0.00", "0"]));
    expect(locked.mutationClicks).toBe(0);
    expect(locked.toast).toContain("Sign in");

    await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true, { email:"signed@example.com" }));
    await expect.poll(() => page.evaluate(() => ({
      signedIn:document.body.classList.contains("finance-signed-in"),
      signedOut:document.body.classList.contains("finance-signed-out"),
      underlyingVisible:getComputedStyle(document.querySelector("#money .page-heading")).display !== "none"
    }))).toEqual({ signedIn:true, signedOut:false, underlyingVisible:true });
  });
}

test("signed-out Settings keeps safe controls while hiding private finance sections", async ({ page }) => {
  await loadStaticApp(page, { width:393, height:852 });
  await page.evaluate(() => {
    window.__safeSettingsClicks = { help:0, storage:0 };
    const help = document.createElement("button");
    help.id = "privacyHelpFixture";
    help.dataset.helpKey = "settings-page";
    help.addEventListener("click", () => { window.__safeSettingsClicks.help += 1; });
    document.body.append(help);
    document.getElementById("requestPersistenceButton")?.addEventListener("click", () => { window.__safeSettingsClicks.storage += 1; });
  });
  await page.addScriptTag({ path:privacyScript });
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(false));
  const state = await page.evaluate(() => {
    document.getElementById("privacyHelpFixture")?.click();
    document.getElementById("requestPersistenceButton")?.click();
    return {
      safeClicks:window.__safeSettingsClicks,
      note:Boolean(document.querySelector(".finance-settings-privacy-note")),
      pdf:getComputedStyle(document.getElementById("pdfPackFile").closest("[data-finance-private-settings]")).display,
      reminders:getComputedStyle(document.getElementById("reminderStatusChip").closest("[data-finance-private-settings]")).display
    };
  });
  expect(state).toEqual({ safeClicks:{ help:1, storage:1 }, note:true, pdf:"none", reminders:"none" });
});

test("browser-delivered configuration contains no privileged secret", async () => {
  const syncConfig = read("sync-config.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const html = read("index.html");
  const formInputs = read("form-inputs.js");
  expect(syncConfig).not.toMatch(/sb_secret_|service_role/i);
  expect(syncConfig).not.toMatch(/OPENAI_API_KEY\s*[:=]\s*["'][^"']+/i);
  expect(html).toContain("<title>Talaan</title>");
  expect(formInputs).toMatch(/function validateMoneyInput/);
  expect(formInputs).toMatch(/function evaluateArithmeticExpression/);
});

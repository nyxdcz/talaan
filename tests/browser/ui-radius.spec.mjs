import { test, expect } from "@playwright/test";
import fs from "node:fs";

const source = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

test.use({ serviceWorkers:"block" });

test("UI surfaces use the platform-aligned radius hierarchy while structural and circular shapes stay intentional", async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div class="card" id="card">Card</div>
      <div class="summary-card" id="summaryCard">Summary</div>
      <button class="button" id="button">Button</button>
      <button class="month-nav-button" id="monthButton">Month</button>
      <div class="month-control" id="monthControl">Control</div>
      <input id="input" value="1">
      <select id="select"><option>One</option></select>
      <textarea id="textarea">Text</textarea>
      <div class="context-menu" id="contextMenu">Menu</div>
      <div class="panel" id="panel">Panel</div>
      <div class="topbar-tools-panel" id="popover">Popover</div>
      <div class="month-picker-popover" id="semanticPopover" role="dialog">Semantic popover</div>
      <div class="finance-privacy-lock-card" id="privacyLock">Privacy lock</div>
      <dialog id="dialog" open>Dialog</dialog>
      <div class="legend-item" id="legendItem">Legend</div>
      <div class="month-comparison-item" id="comparisonItem">Comparison</div>
      <div class="ledger-transfer-preview" id="ledgerPreview">Ledger</div>
      <div class="month-status-chip" id="pill">Pill</div>
      <div class="avatar" id="avatar">A</div>
      <div class="structural-join" id="join">Join</div>`;
  });

  await page.addStyleTag({ content:`
    #pill { border-radius:999px; }
    #avatar { width:32px; height:32px; border-radius:50%; }
    #join { border-radius:0; }
  ` });
  await page.addStyleTag({ url:"http://127.0.0.1:3000/ui-radius.css?v=2.5.0-talaan4" });

  for (const selector of ["#card", "#summaryCard", "#legendItem", "#comparisonItem", "#ledgerPreview"]) {
    await expect(page.locator(selector)).toHaveCSS("border-radius", "12px");
  }
  for (const selector of ["#button", "#monthButton", "#monthControl", "#input", "#select", "#textarea"]) {
    await expect(page.locator(selector)).toHaveCSS("border-radius", "12px");
  }
  await expect(page.locator("#contextMenu")).toHaveCSS("border-radius", "12px");
  await expect(page.locator("#panel")).toHaveCSS("border-radius", "16px");
  await expect(page.locator("#popover")).toHaveCSS("border-radius", "12px");
  await expect(page.locator("#semanticPopover")).toHaveCSS("border-radius", "12px");
  await expect(page.locator("#privacyLock")).toHaveCSS("border-radius", "20px");
  await expect(page.locator("#dialog")).toHaveCSS("border-radius", "20px");

  await expect(page.locator("#pill")).toHaveCSS("border-radius", "999px");
  await expect(page.locator("#avatar")).toHaveCSS("border-radius", "50%");
  await expect(page.locator("#join")).toHaveCSS("border-radius", "0px");
});

test("runtime summary layer imports the canonical radius stylesheet", () => {
  expect(source("summary-mascots.css")).toContain('@import url("./ui-radius.css?v=2.5.0-talaan4")');
  expect(source("ui-radius.css")).toContain("--talaan-control-radius: 12px");
  expect(source("ui-radius.css")).toContain("--talaan-card-radius: 12px");
  expect(source("ui-radius.css")).toContain("--talaan-section-radius: 16px");
  expect(source("ui-radius.css")).toContain("--talaan-dialog-radius: 20px");
  expect(source("ui-radius.css")).toContain("--talaan-ui-radius: var(--talaan-card-radius)");
});

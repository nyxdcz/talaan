import { test, expect } from "../helpers/browser-fixtures.mjs";
import fs from "node:fs";

const source = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

for (const [label, width] of [["phone", 390], ["desktop", 1280]]) {
  test(`expense dialog structurally removes redundant guidance on ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("http://127.0.0.1:3000/?page=money", { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("[data-expense-mode-surrogate='true']"));

    await expect(page.locator("#expenseDialog > form > .modal-body > .required-note")).toHaveCount(0);
    await expect(page.locator("#expenseDialog #expenseFormModeNote")).toHaveCount(0);
    await expect(page.locator("[data-expense-mode-surrogate='true']")).toBeHidden();
    await expect(page.locator("#incomeDialog .required-note")).toHaveCount(1);
  });
}

test("expense dialog cleanup is structural and delivered by the network-first privacy runtime", async () => {
  const privacy = source("privacy-lock.js");
  const worker = source("sw.js");
  const desktopUx = source("desktop-ux.css");

  expect(privacy).toContain("function structurallyRemoveExpenseDialogGuidance()");
  expect(privacy).toContain('dialog.querySelector(":scope > form > .modal-body > .required-note")?.remove();');
  expect(privacy).toContain('const modeNote=dialog.querySelector("#expenseFormModeNote");');
  expect(privacy).toContain("modeNote.remove();");
  expect(privacy).toContain('surrogate.dataset.expenseModeSurrogate="true";');
  expect(worker).toContain('url.pathname.endsWith("privacy-lock.js")');
  expect(worker).toContain('url.pathname.endsWith("cloud-sync-lifecycle.js")');
  expect(worker).toContain("networkFirstCriticalAsset(request, event)");
  expect(desktopUx).not.toContain("#expenseDialog #expenseFormModeNote");
});

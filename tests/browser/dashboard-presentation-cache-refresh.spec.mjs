import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("Dashboard presentation receives a dedicated one-time cache refresh", () => {
  const updater = fs.readFileSync("assets/js/pwa-update.js", "utf8");
  const brandIcons = fs.readFileSync("assets/js/brand-icons.js", "utf8");

  expect(updater).toContain('const UI_HOTFIX_REFRESH_KEY = "finance-ui-hotfix-v2-0-1-talaan8"');
  expect(updater).toContain('const DASHBOARD_PRESENTATION_REFRESH_KEY = "finance-dashboard-presentation-v2-5-0-talaan9"');
  expect(updater).toContain("refreshDashboardPresentationOnce");
  expect(updater).toContain('"/brand-icons.js"');
  expect(updater).toContain('"/income-expenses-compact.css"');
  expect(updater).toContain('"/production-ui-audit.css"');
  expect(updater).not.toContain("document");
  expect(brandIcons).toContain('id:"incomeExpensesCompactStylesheet"');
  expect(brandIcons).toContain('income-expenses-compact.css?v=2.5.0-income-expenses-compact2');
});

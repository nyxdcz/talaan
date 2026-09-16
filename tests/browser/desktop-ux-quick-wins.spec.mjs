import { test, expect } from "@playwright/test";
import fs from "node:fs";

const source = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

test("Talaan V2.5.0 source keeps the approved desktop UX quick wins", async () => {
  const index = source("index.html");
  const agenda = source("projects-calendar.js");
  const budget = source("budget-planning.js");
  const sw = source("sw.js");
  const version = JSON.parse(source("version.json"));

  expect(index).toContain("<title>Talaan</title>");
  expect(index).not.toContain("<title>Talaan · V2.5.0</title>");
  expect(index).toContain("Manage available money and unpaid expenses for this month.");
  expect(index).toContain('id="incomeActiveFilterChips"');
  expect(index).toContain("No income matches these filters");
  expect(index).toContain("No expenses match these filters");
  expect(index).toContain("No projects in this column match the filters.");
  expect(index).toContain("View unpaid expenses");
  expect(index).toContain('action:"clear-income-filters"');
  expect(source("interaction-patterns.js")).toContain("emptyStateHtml");
  expect(source("interaction-patterns.js")).toContain("renderIncomeFilterChips");
  expect(source("interaction-patterns.js")).toContain("setupEmptyStateActions");

  expect(agenda).toContain("Enter an event title.");
  expect(agenda).toContain("Choose an event date.");
  expect(agenda).toContain("End time must be after the start time.");
  expect(agenda).toContain("openAppConfirmation");
  expect(agenda).not.toContain('confirm(`Delete “${event.title}”?`)');
  expect(agenda).toContain("pc-event-more-panel");
  expect(agenda).toContain("Export ICS");
  expect(agenda).toContain("Delete event");

  expect(budget).toContain('id="budgetPlannerMorePanel"');
  expect(budget).toContain('id="openBudgetSettings"');
  expect(budget).toContain('id="exportBudgetCsv"');
  expect(budget).toContain('aria-haspopup="menu"');

  expect(source("productivity-tools.js")).toContain("data-clear-global-search");
  expect(source("productivity-tools.js")).toContain("Clear search");
  expect(source("productivity-tools.js")).toContain('input.value=""');
  expect(index).toContain("./productivity-tools.js?v=2.5.0-talaan1");

  expect(version.version).toBe("2.5.0");
  expect(version.schemaVersion).toBe(12);
  expect(version.cloudSchemaVersion).toBe(3);
  expect(version.cacheVersion).toBe("finance-v2-20260828-household-splits-r17");
  expect(sw).toContain('finance-v2-20260828-household-splits-r17');
});

for (const width of [1024, 1280, 1366, 1440, 1920]) {
  test(`Talaan V2.5.0 desktop additions avoid horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=2.5.0-talaan1"><link rel="stylesheet" href="http://127.0.0.1:3000/shell-ui.css?v=2.5.0-talaan1"><link rel="stylesheet" href="http://127.0.0.1:3000/desktop-ux.css?v=2.5.0-talaan1"></head><body><div class="income-active-filter-chips"><span class="ui-chip"><span>Category: Utilities</span><button class="ui-chip-remove" aria-label="Remove category filter">×</button></span></div><div class="empty-state"><strong>No records</strong>Nothing matches.<div class="empty-state-actions"><button class="button button-secondary button-small">Clear filters</button></div></div><div class="budget-planner-more-menu overflow-menu"><button class="button button-secondary button-small overflow-menu-trigger">More</button><div class="record-more-panel budget-planner-more-panel" hidden></div></div></body></html>`, { waitUntil:"networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
  });
}

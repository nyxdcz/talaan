import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

test("attachAccessibleHelpDescription attaches accessible description and updates aria-describedby", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?page=dashboard", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.attachAccessibleHelpDescription === "function");

  const result = await page.evaluate(() => {
    const container = document.createElement("div");
    container.id = "testHelpContainer";
    const target = document.createElement("button");
    target.id = "testHelpTarget";
    target.textContent = "Test Target";
    container.appendChild(target);
    document.body.appendChild(container);

    window.attachAccessibleHelpDescription(target, "dashboard-overview");

    const desc = container.querySelector('[data-help-description="dashboard-overview"]');
    const describedBy = target.getAttribute("aria-describedby");

    return {
      hasDescription: Boolean(desc),
      descClassName: desc?.className,
      descId: desc?.id,
      descText: desc?.textContent,
      describedBy,
      describedByMatchesId: describedBy === desc?.id
    };
  });

  expect(result.hasDescription).toBe(true);
  expect(result.descClassName).toBe("sr-only help-accessible-description");
  expect(result.descId).toMatch(/^help-description-dashboard-overview-\d+$/);
  expect(result.descText).toBe("Monthly overview: A quick view of the selected month’s money, expenses, savings, projects, and recent changes.");
  expect(result.describedByMatchesId).toBe(true);
});

test("attachAccessibleHelpDescription preserves existing aria-describedby tokens", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?page=dashboard", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.attachAccessibleHelpDescription === "function");

  const result = await page.evaluate(() => {
    const container = document.createElement("div");
    const target = document.createElement("button");
    target.setAttribute("aria-describedby", "existing-desc-1 existing-desc-2");
    container.appendChild(target);
    document.body.appendChild(container);

    window.attachAccessibleHelpDescription(target, "dash-available");

    const desc = container.querySelector('[data-help-description="dash-available"]');
    const describedByTokens = (target.getAttribute("aria-describedby") || "").split(/\s+/);

    return {
      tokens: describedByTokens,
      descId: desc?.id
    };
  });

  expect(result.tokens).toContain("existing-desc-1");
  expect(result.tokens).toContain("existing-desc-2");
  expect(result.tokens).toContain(result.descId);
  expect(result.tokens.length).toBe(3);
});

test("attachAccessibleHelpDescription is idempotent and avoids duplicate descriptions or aria-describedby IDs", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?page=dashboard", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.attachAccessibleHelpDescription === "function");

  const result = await page.evaluate(() => {
    const container = document.createElement("div");
    const target = document.createElement("button");
    container.appendChild(target);
    document.body.appendChild(container);

    window.attachAccessibleHelpDescription(target, "dash-income");
    window.attachAccessibleHelpDescription(target, "dash-income");

    const descElements = container.querySelectorAll('[data-help-description="dash-income"]');
    const describedByTokens = (target.getAttribute("aria-describedby") || "").split(/\s+/);

    return {
      descCount: descElements.length,
      tokenCount: describedByTokens.length,
      descId: descElements[0]?.id,
      tokens: describedByTokens
    };
  });

  expect(result.descCount).toBe(1);
  expect(result.tokenCount).toBe(1);
  expect(result.tokens[0]).toBe(result.descId);
});

test("attachAccessibleHelpDescription returns early when target, topic, or container is invalid", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?page=dashboard", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.attachAccessibleHelpDescription === "function");

  const result = await page.evaluate(() => {
    // 1. Invalid key
    const container1 = document.createElement("div");
    const target1 = document.createElement("button");
    container1.appendChild(target1);
    document.body.appendChild(container1);
    window.attachAccessibleHelpDescription(target1, "non-existent-key-12345");

    // 2. Target inside #sectionHelpDialog
    const helpDialog = document.createElement("dialog");
    helpDialog.id = "sectionHelpDialog";
    const target2 = document.createElement("button");
    helpDialog.appendChild(target2);
    document.body.appendChild(helpDialog);
    window.attachAccessibleHelpDescription(target2, "dashboard-overview");

    return {
      target1DescribedBy: target1.getAttribute("aria-describedby"),
      container1ChildrenCount: container1.children.length,
      target2DescribedBy: target2.getAttribute("aria-describedby"),
      helpDialogChildrenCount: helpDialog.children.length
    };
  });

  expect(result.target1DescribedBy).toBeNull();
  expect(result.container1ChildrenCount).toBe(1);
  expect(result.target2DescribedBy).toBeNull();
  expect(result.helpDialogChildrenCount).toBe(1);
});

test("Application Help external runtime preserves dialog and focus return", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/?page=dashboard", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.openContextHelp === "function" && Boolean(document.documentElement.dataset.helpTopicCount));

  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.id = "applicationHelpFocusReturnProbe";
    trigger.type = "button";
    trigger.textContent = "Help test trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    window.openContextHelp("dashboard-overview", trigger);
  });

  const trigger = page.locator("#applicationHelpFocusReturnProbe");
  const dialog = page.locator("#sectionHelpDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#sectionHelpDialogTitle")).toHaveText("Monthly overview");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

import { test, expect } from "../helpers/browser-fixtures.mjs";

const fixture = `<!doctype html><html data-theme="dark"><head>
  <link rel="stylesheet" href="http://127.0.0.1:3000/app.css?v=structured-drag-test">
  <link rel="stylesheet" href="http://127.0.0.1:3000/projects-calendar.css?v=structured-drag-test">
</head><body>
  <div class="finance-kanban-board project-kanban-board">
    <section class="finance-kanban-column" id="active" data-structured-drop-zone data-structured-drop-kind="project" data-structured-drop-destination="active" data-structured-drop-label="Active Projects">
      <article class="project-record finance-kanban-card" draggable="true" tabindex="0" data-structured-card="project" data-structured-card-draggable data-structured-id="project-1" data-structured-label="Garden plan" data-structured-origin="active">
        <span class="finance-kanban-card-grip" aria-hidden="true">⠿</span><strong>Garden plan</strong><button type="button">Edit</button>
      </article>
    </section>
    <section class="finance-kanban-column" id="review" data-structured-drop-zone data-structured-drop-kind="project" data-structured-drop-destination="review" data-structured-drop-label="Review Projects"></section>
    <section class="finance-kanban-column" id="completedProjectsCard" data-structured-drop-zone data-structured-drop-kind="project" data-structured-drop-destination="completed" data-structured-drop-label="Completed Projects"></section>
  </div>
  <div class="structured-drag-toast" id="structuredDragToast" role="status" aria-live="polite" hidden><span data-structured-toast-message></span><button type="button" data-structured-toast-undo hidden>Undo</button><button type="button" data-structured-toast-dismiss>×</button></div>
  <div id="structuredDragAnnouncer" role="status" aria-live="polite"></div>
</body></html>`;

async function loadFixture(page, viewport = { width:1280, height:800 }) {
  await page.setViewportSize(viewport);
  await page.setContent(fixture, { waitUntil:"networkidle" });
  await page.evaluate(() => {
    window.__moves = [];
    window.__undos = 0;
    window.FinanceStructuredDropActions = {
      project:{
        async move(id, destination) {
          window.__moves.push([id, destination]);
          return { success:true, message:"Garden plan moved to Completed Projects.", undo:() => { window.__undos += 1; return true; } };
        }
      }
    };
  });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/interaction-patterns.js?v=structured-drag-test" });
}

test("keyboard pickup exposes the destination, commits, and offers Undo", async ({ page }) => {
  await loadFixture(page);
  const card = page.locator("[data-structured-card-draggable]");
  await card.focus();
  await card.press("Space");
  await expect(page.locator("#review")).toHaveClass(/is-structured-drop-target/);
  await expect(page.locator("#structuredDragAnnouncer")).toContainText("ready");
  await card.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__moves)).toEqual([["project-1", "review"]]);
  await card.press("Space");
  await card.press("ArrowRight");
  await card.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__moves)).toEqual([["project-1", "review"], ["project-1", "completed"]]);
  await expect(page.locator("#structuredDragToast")).toBeVisible();
  await expect(page.locator("[data-structured-toast-message]")).toContainText("moved to Completed Projects");
  await page.locator("[data-structured-toast-undo]").click();
  await expect.poll(() => page.evaluate(() => window.__undos)).toBe(1);
  await expect(page.locator("[data-structured-toast-message]")).toContainText("Move undone");
});

test("Escape and invalid drops return without changing data", async ({ page }) => {
  await loadFixture(page);
  const card = page.locator("[data-structured-card-draggable]");
  await card.focus();
  await card.press("Space");
  await card.press("Escape");
  await expect(page.locator(".project-record")).not.toHaveClass(/is-structured-dragging/);
  await expect(page.locator("#completedProjectsCard")).not.toHaveClass(/is-structured-drop-target/);
  expect(await page.evaluate(() => window.__moves)).toEqual([]);
  await expect(page.locator("#structuredDragAnnouncer")).toContainText("cancelled");
});

test("phone board scrolls horizontally and whole cards are touch safe", async ({ browser }) => {
  const context = await browser.newContext({ viewport:{ width:390, height:800 }, reducedMotion:"reduce" });
  const page = await context.newPage();
  await loadFixture(page, { width:390, height:800 });
  const metrics = await page.locator("[data-structured-card-draggable]").evaluate(node => {
    const box = node.getBoundingClientRect();
    const board = node.closest(".finance-kanban-board");
    node.classList.add("is-structured-returning");
    return { width:box.width, height:box.height, animation:getComputedStyle(node).animationName, touchAction:getComputedStyle(node).touchAction, scrollWidth:board.scrollWidth, clientWidth:board.clientWidth };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(260);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.animation).toBe("none");
  expect(metrics.touchAction).toBe("pan-y");
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  await context.close();
});

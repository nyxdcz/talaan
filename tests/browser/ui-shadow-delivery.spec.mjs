import { test, expect } from "@playwright/test";

test.use({ serviceWorkers:"block" });

test("canonical UI shadow contract is published to the runtime", async ({ request }) => {
  const radiusResponse = await request.get("http://127.0.0.1:3000/ui-radius.css?v=2.5.0-talaan4");
  expect(radiusResponse.ok()).toBeTruthy();
  const radiusCss = await radiusResponse.text();
  expect(radiusCss).toContain("--shadow-level-0: none");
  expect(radiusCss).toContain("--shadow-level-2: 0 8px 24px");
  expect(radiusCss).toContain("#dashboard :is(.card,.dashboard-detail-card)");
  expect(radiusCss).toContain("html body #sidebar.sidebar::after");
  expect(radiusCss).toContain("width: 1px");
  expect(radiusCss).toContain("margin-inline: -13px");

  const summaryResponse = await request.get("http://127.0.0.1:3000/summary-mascots.css?v=2.5.0-talaan1");
  expect(summaryResponse.ok()).toBeTruthy();
  const html = await (await request.get("http://127.0.0.1:3000/index.html")).text();
  const radiusUrl = html.match(/href="(\.\/ui-radius\.css\?v=2\.5\.0-ui-[a-f0-9]+)"/)[1];
  expect(await summaryResponse.text()).toContain(`@import url("${radiusUrl}")`);
});

import { test, expect } from "../helpers/browser-fixtures.mjs";

test("Talaan V2.5.0 Finance period surfaces keep exposed corners and flush internal joins", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"networkidle" });

  await page.evaluate(() => {
    const money = document.getElementById("money");
    if (!money) throw new Error("Money page fixture missing");
    const fixture = document.createElement("section");
    fixture.id = "periodRadiusFixture";
    fixture.className = "period-card";
    fixture.innerHTML = `<div class="period-header">Period header</div><div class="record-row">Expense row</div>`;
    money.appendChild(fixture);
  });

  const radiusOf = selector => page.locator(selector).evaluate(element => ({
    topLeft:getComputedStyle(element).borderTopLeftRadius,
    topRight:getComputedStyle(element).borderTopRightRadius,
    bottomRight:getComputedStyle(element).borderBottomRightRadius,
    bottomLeft:getComputedStyle(element).borderBottomLeftRadius
  }));

  expect(await radiusOf("#periodRadiusFixture")).toEqual({
    topLeft:"14px",
    topRight:"14px",
    bottomRight:"14px",
    bottomLeft:"14px"
  });
  expect(await radiusOf("#periodRadiusFixture .period-header")).toEqual({
    topLeft:"14px",
    topRight:"14px",
    bottomRight:"0px",
    bottomLeft:"0px"
  });
  expect(await radiusOf("#periodRadiusFixture .record-row")).toEqual({
    topLeft:"0px",
    topRight:"0px",
    bottomRight:"0px",
    bottomLeft:"0px"
  });
});

test("Finance phone rows use flush internal joins while the period keeps its exposed corners", async ({ page }) => {
  await page.setViewportSize({ width:393, height:852 });
  await page.goto("http://127.0.0.1:3000/index.html?page=money", { waitUntil:"networkidle" });
  await page.evaluate(() => {
    const money = document.getElementById("money");
    if (!money) throw new Error("Money page fixture missing");
    const fixture = document.createElement("section");
    fixture.id = "phonePeriodRadiusFixture";
    fixture.className = "period-card";
    fixture.innerHTML = `<div class="period-header">Period header</div><div class="record-row">Expense row</div>`;
    money.appendChild(fixture);
  });
  const radiusOf = selector => page.locator(selector).evaluate(element => ({
    topLeft:getComputedStyle(element).borderTopLeftRadius,
    topRight:getComputedStyle(element).borderTopRightRadius,
    bottomRight:getComputedStyle(element).borderBottomRightRadius,
    bottomLeft:getComputedStyle(element).borderBottomLeftRadius
  }));
  expect(await radiusOf("#phonePeriodRadiusFixture")).toEqual({
    topLeft:"12px", topRight:"12px", bottomRight:"12px", bottomLeft:"12px"
  });
  expect(await radiusOf("#phonePeriodRadiusFixture .period-header")).toEqual({
    topLeft:"12px", topRight:"12px", bottomRight:"0px", bottomLeft:"0px"
  });
  expect(await radiusOf("#phonePeriodRadiusFixture .record-row")).toEqual({
    topLeft:"0px", topRight:"0px", bottomRight:"0px", bottomLeft:"0px"
  });
});

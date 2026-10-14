import { expect, test } from "../helpers/browser-fixtures.mjs";
/* global data */

const app = "http://127.0.0.1:3000/index.html?page=settings&settings=finance-tools";

test("payee normalization and deterministic rules are safe and explainable", async ({ page }) => {
  await page.goto(app, { waitUntil:"networkidle" });
  await page.waitForFunction(() => Boolean(window.FinancePayeeRules && window.FinancePrivacyLock));
  await page.evaluate(() => window.FinancePrivacyLock.setAuthenticated(true));
  const result = await page.evaluate(() => {
    data.ledgerSettings = { version:1 };
    const emptyAfterLateLoad = window.FinancePayeeRules.data;
    const financeTools = {
      version:1,
      payees:[{ id:"payee-shop", name:"Mérchant Shop", aliases:["ＭＥＲＣＨＡＮＴ　ＳＨＯＰ"], defaultCategory:"Groceries", defaultAccount:"Cash", archived:false }],
      transactionRules:[
        { id:"rule-b", name:"Assign payee", enabled:true, priority:20, match:{mode:"all",conditions:[{field:"description",operator:"contains",value:"merchant"}]}, actions:{payeeId:"payee-shop"}, continue:true, createdAt:"2026-01-01T00:00:00.000Z" },
        { id:"rule-c", name:"Add reviewed tag", enabled:true, priority:20, match:{mode:"all",conditions:[{field:"category",operator:"equals",value:"Groceries"}]}, actions:{tags:["Reviewed"]}, continue:false, createdAt:"2026-01-02T00:00:00.000Z" }
      ]
    };
    data.ledgerSettings.financeTools = window.FinancePayeeRules.normalizeTools(financeTools);
    const record = { id:"expense-safe", name:"MERCHANT SHOP order", notes:"Weekly", category:"Other", account:"Maya", amount:420, paid:true, paidDate:"2026-08-24", accountDeducted:true, paymentTransactionId:"payment-safe", includeInTotals:true };
    const preview = window.FinancePayeeRules.previewRecord(record, "expenses");
    const bad = window.FinancePayeeRules.normalizeRule({ id:"bad", name:"Bad regex", enabled:true, priority:1, match:{mode:"all",conditions:[{field:"description",operator:"regex",value:"["}]}, actions:{category:"Unsafe"} });
    const unsafe = { id:"unsafe", name:"Unsafe account mutation", enabled:true, priority:1, match:{mode:"all",conditions:[{field:"description",operator:"contains",value:"shop"}]}, actions:{account:"Cash"} };
    return {
      alias:window.FinancePayeeRules.resolvePayee("ＭＥＲＣＨＡＮＴ　ＳＨＯＰ")?.id,
      matches:preview.matches.map(item => item.id), changes:preview.changes.map(item => item.field), after:preview.after,
      regexErrors:window.FinancePayeeRules.validateRule(bad), unsafeErrors:window.FinancePayeeRules.validateRule(unsafe), accounts:{...data.accounts}, emptyAfterLateLoad
    };
  });
  expect(result.emptyAfterLateLoad).toEqual({ version:1, payees:[], transactionRules:[] });
  expect(result.alias).toBe("payee-shop");
  expect(result.matches).toEqual(["rule-b", "rule-c"]);
  expect(result.changes).toEqual(expect.arrayContaining(["payeeId", "category", "suggestedAccount", "tags"]));
  expect(result.after.paid).toBe(true);
  expect(result.after.accountDeducted).toBe(true);
  expect(result.after.paymentTransactionId).toBe("payment-safe");
  expect(result.after.account).toBe("Maya");
  expect(result.regexErrors.join(" ")).toMatch(/regular expression/i);
  expect(result.unsafeErrors.join(" ")).toMatch(/unsupported action/i);
});

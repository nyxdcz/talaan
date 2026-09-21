import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { test } from "@playwright/test";

test("manual net worth normalizes, calculates, evolves, and merges deterministically", () => {
  const context = vm.createContext({ console, structuredClone, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, RegExp, Error, crypto:webcrypto, __FINANCE_NET_WORTH_TEST__:true });
  let source = fs.readFileSync("assets/js/net-worth.js", "utf8");
  source = source.replace("const API = { version:VERSION,", "const API = { clone, version:VERSION,");
  vm.runInContext(source, context);
  const engine = context.FinanceNetWorth;

  // Clone edge case tests (primitives, nullish values, structuredClone happy path, and JSON fallback)
  assert.equal(engine.clone(null), null);
  assert.equal(engine.clone(undefined), undefined);
  assert.equal(engine.clone(42), 42);
  assert.equal(engine.clone("talaan"), "talaan");
  assert.equal(engine.clone(true), true);

  const sampleObj = { name: "Asset", metadata: { currency: "PHP" } };
  const clonedObj = engine.clone(sampleObj);
  assert.deepEqual(clonedObj, sampleObj);
  assert.notEqual(clonedObj, sampleObj);
  assert.notEqual(clonedObj.metadata, sampleObj.metadata);

  // Objects with functions fail structuredClone -> JSON fallback strips functions
  const objWithFn = { name: "House", value: 5000000, calculate: () => 5000000 };
  const clonedObjWithFn = engine.clone(objWithFn);
  assert.deepEqual(clonedObjWithFn, { name: "House", value: 5000000 });
  assert.equal(clonedObjWithFn.calculate, undefined);

  // Objects with uncloneable DOM node / getters throw DataCloneError -> JSON fallback handles gracefully
  const domNodeObj = { id: "item-dom", element: { nodeType: 1, nodeName: "DIV" } };
  Object.defineProperty(domNodeObj.element, "ownerDocument", {
    get() { throw new Error("DataCloneError: DOM node cannot be cloned"); }
  });
  const clonedDomNode = engine.clone(domNodeObj);
  assert.deepEqual(clonedDomNode, { id: "item-dom", element: { nodeType: 1, nodeName: "DIV" } });
  const plain = value => JSON.parse(JSON.stringify(value));
  const stamp = "2026-08-27T00:00:00.000Z";
  const store = engine.normalizeStore({ staleAfterDays:30, items:[
    { id:"home", name:"Family home", type:"asset", category:"Property", currency:"PHP", createdAt:stamp, updatedAt:stamp, valuations:[
      { id:"home-1", date:"2026-01-01", nativeAmount:4000000, phpRate:1, createdAt:stamp, updatedAt:stamp },
      { id:"home-2", date:"2026-08-20", nativeAmount:4250000, phpRate:1, createdAt:stamp, updatedAt:stamp }
    ] },
    { id:"usd-fund", name:"USD fund", type:"asset", category:"Investments", currency:"USD", createdAt:stamp, updatedAt:stamp, valuations:[
      { id:"usd-1", date:"2026-08-20", nativeAmount:1000, phpRate:58.25, createdAt:stamp, updatedAt:stamp }
    ] },
    { id:"mortgage", name:"Mortgage", type:"liability", category:"Housing debt", currency:"PHP", createdAt:stamp, updatedAt:stamp, valuations:[
      { id:"mortgage-1", date:"2026-08-20", nativeAmount:1800000, phpRate:1, createdAt:stamp, updatedAt:stamp }
    ] }
  ] });

  assert.equal(store.version, 1);
  assert.equal(store.baseCurrency, "PHP");
  assert.equal(store.items.find(item => item.id === "usd-fund").valuations[0].amountPhp, 58250);
  const totals = engine.metrics(store, "2026-08-27");
  assert.equal(totals.assets, 4308250);
  assert.equal(totals.liabilities, 1800000);
  assert.equal(totals.netWorth, 2508250);
  assert.equal(totals.staleCount, 0);
  assert.deepEqual(plain(engine.composition(store, "asset", "2026-08-27")), [
    { category:"Property", amount:4250000 },
    { category:"Investments", amount:58250 }
  ]);
  assert.deepEqual(plain(engine.evolution(store).map(point => point.netWorth)), [4000000, 2508250]);

  const incoming = engine.normalizeStore({ items:[
    { ...plain(store.items[0]), name:"Incoming home", valuations:[...plain(store.items[0].valuations), { id:"home-3", date:"2026-08-27", nativeAmount:4300000, phpRate:1, createdAt:stamp, updatedAt:stamp }] },
    { id:"car", name:"Car", type:"asset", category:"Vehicle", currency:"PHP", createdAt:stamp, updatedAt:stamp, valuations:[{ id:"car-1", date:"2026-08-27", nativeAmount:500000, phpRate:1, createdAt:stamp, updatedAt:stamp }] }
  ] });
  assert.equal(engine.countConflicts(store, incoming), 1);
  const keepCurrent = engine.mergeStores(store, incoming, "current");
  assert.equal(keepCurrent.items.find(item => item.id === "home").name, "Family home");
  assert.equal(keepCurrent.items.find(item => item.id === "home").valuations.length, 3);
  assert.ok(keepCurrent.items.some(item => item.id === "car"));
  const takeIncoming = engine.mergeStores(store, incoming, "incoming");
  assert.equal(takeIncoming.items.find(item => item.id === "home").name, "Incoming home");
});

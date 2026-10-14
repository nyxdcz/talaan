import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { test } from "../helpers/browser-fixtures.mjs";

test("household allocations, personal shares, positions, and merges are deterministic", () => {
  const context = vm.createContext({ console, structuredClone, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, RegExp, Error, crypto:webcrypto, __FINANCE_HOUSEHOLD_SPLITS_TEST__:true });
  vm.runInContext(fs.readFileSync("assets/js/household-splits.js", "utf8"), context);
  const engine = context.FinanceHouseholdSplits;
  const plain = value => JSON.parse(JSON.stringify(value));
  const stamp = "2026-08-28T00:00:00.000Z";
  const group = engine.normalizeGroup({ id:"home", name:"Home", ownerMemberId:"you", createdAt:stamp, updatedAt:stamp, members:[
    { id:"you", name:"You", sortIndex:0, createdAt:stamp, updatedAt:stamp },
    { id:"alex", name:"Alex", sortIndex:1, createdAt:stamp, updatedAt:stamp },
    { id:"bea", name:"Bea", sortIndex:2, createdAt:stamp, updatedAt:stamp }
  ] });

  const equal = engine.allocateShares(100, group.members, "equal");
  assert.equal(equal.ok, true);
  assert.equal(equal.shares.reduce((sum, share) => sum + share.amount, 0), 100);
  assert.deepEqual(plain(equal.shares.map(share => share.amount)), [33.33, 33.34, 33.33]);
  const percentage = engine.allocateShares(1000, group.members, "percentage", { you:50, alex:30, bea:20 });
  assert.deepEqual(plain(percentage.shares.map(share => share.amount)), [500, 300, 200]);
  assert.equal(engine.allocateShares(1000, group.members, "percentage", { you:50, alex:30, bea:10 }).ok, false);
  assert.equal(engine.allocateShares(1000, group.members, "exact", { you:500, alex:300, bea:100 }).ok, false);

  const split = engine.normalizeSplit({ groupId:group.id, groupName:group.name, ownerMemberId:group.ownerMemberId, method:"percentage", totalAmount:1000, shares:percentage.shares, payerMemberId:"alex", updatedAt:stamp }, 1000, group);
  assert.equal(split.ownerShare, 500);
  assert.equal(engine.personalAmount({ amount:1000, householdSplit:split }, 600), 300);

  const store = engine.normalizeStore({ groups:[group], settlements:[{ id:"settle", groupId:"home", fromMemberId:"you", toMemberId:"alex", amount:200, date:"2026-08-28", createdAt:stamp, updatedAt:stamp }] });
  const positions = engine.positions(store, [{ id:"bill", amount:1000, paid:true, householdSplit:split }], "home");
  assert.deepEqual(plain(positions.map(member => [member.id, member.position])), [["you",-300],["alex",500],["bea",-200]]);
  assert.equal(positions.reduce((sum, member) => sum + member.position, 0), 0);

  const incoming = engine.normalizeStore({ groups:[{ ...plain(group), name:"Incoming Home" }], settlements:[...plain(store.settlements), { id:"settle-2", groupId:"home", fromMemberId:"bea", toMemberId:"alex", amount:200, date:"2026-08-28", createdAt:stamp, updatedAt:stamp }] });
  assert.equal(engine.countConflicts(store, incoming), 1);
  assert.equal(engine.mergeStores(store, incoming, "current").groups[0].name, "Home");
  assert.equal(engine.mergeStores(store, incoming, "incoming").groups[0].name, "Incoming Home");
  assert.equal(engine.mergeStores(store, incoming, "current").settlements.length, 2);
});

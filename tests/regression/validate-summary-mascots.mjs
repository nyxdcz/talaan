import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("assets/js/ui/summary-mascots.js", "utf8");

function createMockContext(customIntl) {
  const listeners = {};
  const mockElement = {
    classList: { add() {}, remove() {}, contains() { return false; } },
    dataset: {},
    getAttribute() { return null; },
    setAttribute() {},
    removeAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; }
  };
  const mockDocument = {
    readyState: "complete",
    getElementById() { return mockElement; },
    querySelectorAll() { return []; },
    addEventListener(event, fn) { listeners[event] = fn; }
  };
  const mockMatchMedia = () => ({ matches: true, addEventListener() {} });
  const mockMutationObserver = function() {
    return { observe() {}, disconnect() {} };
  };

  const context = vm.createContext({
    console,
    Date,
    String,
    Number,
    Object,
    Array,
    Intl: customIntl !== undefined ? customIntl : Intl,
    window: {
      matchMedia: mockMatchMedia,
      addEventListener(event, fn) { listeners[event] = fn; }
    },
    document: mockDocument,
    MutationObserver: mockMutationObserver,
    requestAnimationFrame(fn) { fn(); },
    queueMicrotask(fn) { fn(); }
  });
  context.window.window = context.window;
  return context;
}

// Scenario 1: Standard Intl.DateTimeFormat formatting
{
  const context = createMockContext();
  vm.runInContext(source, context);
  const mascots = context.window.FinanceSummaryMascots;
  assert.ok(mascots, "FinanceSummaryMascots must be exported on window");
  const key = mascots.manilaTodayKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/, "manilaTodayKey must return a YYYY-MM-DD string via Intl.DateTimeFormat");
}

// Scenario 2: Today override behavior
{
  const context = createMockContext();
  context.window.FINANCE_SUMMARY_TODAY_OVERRIDE = "2026-07-15";
  vm.runInContext(source, context);
  const mascots = context.window.FinanceSummaryMascots;
  assert.equal(mascots.manilaTodayKey(), "2026-07-15", "FINANCE_SUMMARY_TODAY_OVERRIDE must override manilaTodayKey");
}

// Scenario 3: Catch block fallback when Intl.DateTimeFormat throws
{
  const brokenIntl = {
    DateTimeFormat() {
      throw new Error("Intl.DateTimeFormat stubbed error");
    }
  };
  const context = createMockContext(brokenIntl);
  vm.runInContext(source, context);
  const mascots = context.window.FinanceSummaryMascots;
  const key = mascots.manilaTodayKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/, "manilaTodayKey must fall back to Date methods YYYY-MM-DD format when Intl fails");
  const now = new Date();
  const expectedFallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(key, expectedFallback, "Fallback YYYY-MM-DD string must match Date methods calculation");
}

console.log("Summary Mascots date formatting, override, and catch block fallback validation passed.");

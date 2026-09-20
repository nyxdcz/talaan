import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("assets/js/account-submit-compat.js", "utf8");

function createMockEnvironment(payExpensesHandler) {
  const toasts = [];
  const timeoutQueue = [];

  const mockDocument = {
    getElementById: () => null,
    addEventListener: () => {}
  };

  const context = vm.createContext({
    console,
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    Boolean,
    Error,
    window: {},
    document: mockDocument,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0
    },
    Event: class Event {
      constructor(type, opts) {
        this.type = type;
        this.opts = opts;
      }
    },
    setTimeout: (fn) => {
      timeoutQueue.push(fn);
    },
    showToast: function (message, tone) {
      toasts.push({ message, tone });
    },
    FinanceLedgerTransactions: {
      payExpenses: (items, account, options) => payExpensesHandler(items, account, options)
    },
    FinanceProfileArchitecture: {
      persistCurrentData: () => {}
    },
    persistFinanceDataRaw: () => {}
  });

  context.window = context;
  context.globalThis = context;

  vm.runInContext(source, context);

  // Flush any scheduled timeouts
  while (timeoutQueue.length > 0) {
    const fn = timeoutQueue.shift();
    fn();
  }

  return { context, toasts };
}

// Direct unit & integration tests for friendlyPaymentFailure logic via VM context
{
  let currentResult = { ok: false, reason: "read-only" };
  const env = createMockEnvironment(() => currentResult);

  const testCases = [
    {
      reason: "Custom reason string with spaces",
      expected: "Custom reason string with spaces"
    },
    {
      reason: "read-only",
      expected: "This Viewer profile is read-only. The payment was not recorded."
    },
    {
      reason: "insufficient",
      expected: "The selected payment account does not have enough balance. Nothing was changed."
    },
    {
      reason: "missing-account",
      expected: "The selected payment account no longer exists. Choose another account."
    },
    {
      reason: "empty",
      expected: "This expense is no longer available to mark as paid."
    },
    {
      reason: "critical-issues",
      expected: "Finance history has a critical integrity issue. The payment was not recorded."
    },
    {
      reason: "integrity-service-unavailable",
      expected: "Finance integrity protection is still loading. Reload Talaan before recording this payment."
    },
    {
      reason: "unknown-reason-code",
      expected: "The payment was rolled back by finance safety checks. No balances were changed."
    },
    {
      reason: "",
      expected: "The payment was rolled back by finance safety checks. No balances were changed."
    },
    {
      reason: null,
      expected: "The payment was rolled back by finance safety checks. No balances were changed."
    },
    {
      reason: undefined,
      expected: "The payment was rolled back by finance safety checks. No balances were changed."
    }
  ];

  for (const { reason, expected } of testCases) {
    currentResult = { ok: false, reason };

    // Call payExpenses through wrapped FinanceLedgerTransactions to set lastPaymentFailure
    env.context.FinanceLedgerTransactions.payExpenses([], "Cash");

    // Call showToast with generic message
    env.context.showToast("Payment could not be completed", "warning");

    const lastToast = env.toasts.pop();
    assert.equal(
      lastToast.message,
      expected,
      `Failed mapping for reason "${reason}": expected "${expected}", got "${lastToast.message}"`
    );
  }

  // Verify that subsequent showToast calls without lastPaymentFailure do not map
  env.context.showToast("Payment could not be completed", "warning");
  const unmappedToast = env.toasts.pop();
  assert.equal(
    unmappedToast.message,
    "Payment could not be completed",
    "Should not modify message when lastPaymentFailure is null"
  );
}

console.log("account-submit-compat friendlyPaymentFailure unit and integration validation passed.");

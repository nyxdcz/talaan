import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("assets/js/privacy-display.js", "utf8");
const css = fs.readFileSync("assets/css/privacy-display.css", "utf8");

// Static source/CSS contract assertions
assert.match(source, /simple-finance-privacy-display-v1/);
assert.match(source, /activeProfileId/);
assert.match(source, /originalMoney/);
assert.match(source, /MutationObserver/);
assert.match(source, /aria-label/);
assert.match(source, /aria-valuetext/);
assert.match(source, /privacy-value-mask/);
assert.match(source, /pointerover/);
assert.match(source, /focusin/);
assert.match(source, /WeakMap/);
assert.match(source, /finance:privacy-display-changed/);
assert.doesNotMatch(source, /saveData\s*\(/);
assert.doesNotMatch(source, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(css, /finance-values-hidden canvas/);
assert.match(css, /privacy-value-revealed/);

function createMockEnvironment({ localStorageMock, activeProfileId } = {}) {
  const listeners = {};
  const customEventListeners = {};
  const classList = new Set();

  const mockDocumentElement = {
    classList: {
      toggle(cls, val) {
        if (val) classList.add(cls);
        else classList.delete(cls);
      },
      contains(cls) {
        return classList.has(cls);
      }
    }
  };

  const mockBody = {
    nodeType: 1,
    querySelectorAll: () => [],
    closest: () => null
  };

  const mockDocument = {
    documentElement: mockDocumentElement,
    body: mockBody,
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      id: "",
      type: "",
      className: "",
      innerHTML: "",
      setAttribute: () => {},
      getAttribute: () => null,
      querySelector: () => null,
      appendChild: () => {},
      append: () => {},
      before: () => {}
    }),
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    createTreeWalker: () => ({
      nextNode: () => null
    })
  };

  const mockStorage = localStorageMock || {
    store: {},
    getItem(key) {
      return this.store[key] ?? null;
    },
    setItem(key, val) {
      this.store[key] = String(val);
    }
  };

  const mockWindow = {
    addEventListener: (type, fn) => {
      customEventListeners[type] = fn;
    },
    dispatchEvent: () => true,
    FinanceProfileArchitecture: activeProfileId
      ? { activeProfileId: () => activeProfileId }
      : undefined
  };

  class CustomEvent {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts?.detail;
    }
  }

  const context = vm.createContext({
    console,
    Date,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Map,
    WeakMap,
    Set,
    RegExp,
    Error,
    Element: class Element {},
    Node: { ELEMENT_NODE: 1, SHOW_TEXT: 4 },
    NodeFilter: { FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    CustomEvent,
    localStorage: mockStorage,
    money: (v) => `₱${v}`,
    window: mockWindow,
    document: mockDocument,
    queueMicrotask: (fn) => fn()
  });

  context.window.window = context.window;

  vm.runInContext(source, context);

  return {
    context,
    privacyDisplay: context.window.FinancePrivacyDisplay,
    mockStorage,
    classList,
    customEventListeners
  };
}

// Behavioral Unit Test 1: Storage Key & Default Profile Scoping
{
  const env = createMockEnvironment();
  assert.equal(
    env.privacyDisplay.storageKey,
    "simple-finance-privacy-display-v1:default",
    "Default profile should construct storage key with default profile ID"
  );
}

// Behavioral Unit Test 2: Storage Key with Custom Profile ID Sanitization
{
  const env = createMockEnvironment({ activeProfileId: "user/pro_file#1!" });
  assert.equal(
    env.privacyDisplay.storageKey,
    "simple-finance-privacy-display-v1:user-pro_file-1-",
    "Storage key should sanitize special characters in profile ID"
  );
}

// Behavioral Unit Test 3: read() happy paths and initialization state
{
  const env1 = createMockEnvironment();
  assert.equal(env1.privacyDisplay.hidden, false, "Default initial state should be false when storage is empty");

  const customStorage = {
    store: { "simple-finance-privacy-display-v1:default": "hidden" },
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); }
  };
  const env2 = createMockEnvironment({ localStorageMock: customStorage });
  assert.equal(env2.privacyDisplay.hidden, true, "Initial state should be true when stored value is 'hidden'");
}

// Behavioral Unit Test 4: read() error resilience when localStorage.getItem throws
{
  const throwingGetStorage = {
    getItem() {
      throw new Error("SecurityError: Access denied to localStorage");
    },
    setItem() {}
  };

  assert.doesNotThrow(() => {
    const env = createMockEnvironment({ localStorageMock: throwingGetStorage });
    assert.equal(env.privacyDisplay.hidden, false, "read() should safely return false when getItem throws");
  }, "Privacy display initialization should not throw when getItem fails");
}

// Behavioral Unit Test 5: write() happy path when calling setHidden / toggle
{
  const env = createMockEnvironment();
  const key = env.privacyDisplay.storageKey;

  env.privacyDisplay.setHidden(true);
  assert.equal(env.privacyDisplay.hidden, true);
  assert.equal(env.mockStorage.store[key], "hidden", "setHidden(true) should persist 'hidden' to localStorage");

  env.privacyDisplay.toggle();
  assert.equal(env.privacyDisplay.hidden, false);
  assert.equal(env.mockStorage.store[key], "visible", "toggle() should persist 'visible' to localStorage");
}

// Behavioral Unit Test 6: write() error resilience when localStorage.setItem throws
{
  const throwingSetStorage = {
    getItem() { return null; },
    setItem() {
      throw new Error("QuotaExceededError: localStorage limit exceeded");
    }
  };

  const env = createMockEnvironment({ localStorageMock: throwingSetStorage });
  assert.doesNotThrow(() => {
    const result = env.privacyDisplay.setHidden(true);
    assert.equal(result, true, "setHidden should return updated boolean state even when write() fails");
    assert.equal(env.privacyDisplay.hidden, true, "In-memory hidden state should be updated despite setItem failure");
  }, "setHidden/write should catch and swallow errors when setItem throws");
}

// Behavioral Unit Test 7: Profile change event re-evaluates storage
{
  const customStorage = {
    store: {
      "simple-finance-privacy-display-v1:default": "hidden",
      "simple-finance-privacy-display-v1:profile-b": "visible"
    },
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); }
  };

  const env = createMockEnvironment({ localStorageMock: customStorage, activeProfileId: "default" });
  assert.equal(env.privacyDisplay.hidden, true, "Initial profile active state is hidden");

  // Simulate active profile change
  env.context.window.FinanceProfileArchitecture.activeProfileId = () => "profile-b";
  assert.equal(env.privacyDisplay.storageKey, "simple-finance-privacy-display-v1:profile-b");

  // Trigger finance:profile-changed event
  assert.ok(env.customEventListeners["finance:profile-changed"], "Profile changed event listener must be registered");
  env.customEventListeners["finance:profile-changed"]();

  assert.equal(env.privacyDisplay.hidden, false, "Hidden state updated according to profile-b storage");
}

console.log("Privacy display source contract and runtime behavioral unit tests passed.");

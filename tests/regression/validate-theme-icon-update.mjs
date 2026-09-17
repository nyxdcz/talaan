import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runtimeSource = fs.readFileSync(path.join(root, "assets/js/ui/sync-runtime-compat.js"), "utf8");

function runTestWithEnvironment(options = {}) {
  const elements = new Map();
  const storage = options.initialLocalStorage || {};

  const docElement = {
    dataset: options.documentDataset ? { ...options.documentDataset } : {},
    querySelectorAll: () => [],
    closest: () => null
  };

  const head = {
    appendChild: () => {},
    lastElementChild: null
  };

  const mockDocument = {
    title: "Talaan",
    documentElement: docElement,
    head: head,
    readyState: options.readyState || "complete",
    addEventListener: () => {},
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        dataset: {},
        style: { setProperty: () => {} },
        setAttribute: (k, v) => { el[k] = v; },
        before: () => {},
        appendChild: () => {},
        closest: () => null,
        querySelector: () => null,
        insertAdjacentHTML: () => {}
      };
      return el;
    },
    querySelectorAll: () => []
  };

  const mockLocalStorage = {
    getItem: (key) => {
      if (options.localStorageThrows) {
        throw new Error("Access denied");
      }
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setItem: (key, val) => {
      if (options.localStorageThrows) {
        throw new Error("Access denied");
      }
      storage[key] = String(val);
    }
  };

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
    }
    disconnect() {}
  }

  const mockWindow = {
    location: { href: "http://localhost/" },
    document: mockDocument,
    localStorage: mockLocalStorage,
    MutationObserver: MockMutationObserver,
    queueMicrotask: (fn) => fn()
  };

  if (options.hasThemeToggleIcon !== false) {
    elements.set("themeToggleIcon", { id: "themeToggleIcon", dataset: {} });
  }

  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    MutationObserver: MockMutationObserver,
    queueMicrotask: (fn) => fn(),
    URL: globalThis.URL
  });

  vm.runInContext(runtimeSource, context);

  return { mockWindow, mockDocument, elements };
}

// 1. When #themeToggleIcon is missing, runtime executes safely without error
{
  const { elements } = runTestWithEnvironment({ hasThemeToggleIcon: false });
  assert.equal(elements.get("themeToggleIcon"), undefined);
}

// 2. Attribute mapping when dataset.themePreference is explicitly set
const preferenceCases = [
  { pref: "dark", expected: "night" },
  { pref: "DARK", expected: "night" },
  { pref: "light", expected: "day" },
  { pref: "LIGHT", expected: "day" },
  { pref: "system", expected: "auto" },
  { pref: "SYSTEM", expected: "auto" },
  { pref: "other", expected: "auto" }
];

for (const { pref, expected } of preferenceCases) {
  const { elements } = runTestWithEnvironment({
    documentDataset: { themePreference: pref }
  });
  const themeToggleIcon = elements.get("themeToggleIcon");
  assert.equal(
    themeToggleIcon.dataset.uploadedThemeIcon,
    expected,
    `themePreference "${pref}" should map uploadedThemeIcon to "${expected}"`
  );
}

// 3. Fallback to localStorage when documentElement themePreference dataset attribute is empty/missing
const localStorageCases = [
  { lsVal: "dark", lsExp: "night" },
  { lsVal: "light", lsExp: "day" },
  { lsVal: "system", lsExp: "auto" },
  { lsVal: null, lsExp: "auto" }
];

for (const item of localStorageCases) {
  const initialStorage = item.lsVal !== null ? { "simple-finance-theme-v1": item.lsVal } : {};
  const { elements } = runTestWithEnvironment({
    initialLocalStorage: initialStorage
  });
  const themeToggleIcon = elements.get("themeToggleIcon");
  assert.equal(
    themeToggleIcon.dataset.uploadedThemeIcon,
    item.lsExp,
    `localStorage value "${item.lsVal}" should map uploadedThemeIcon to "${item.lsExp}"`
  );
}

// 4. Fallback to "system" ("auto") when localStorage throws exception
{
  const { elements } = runTestWithEnvironment({
    localStorageThrows: true
  });
  const themeToggleIcon = elements.get("themeToggleIcon");
  assert.equal(
    themeToggleIcon.dataset.uploadedThemeIcon,
    "auto",
    "should fallback to auto when localStorage throws"
  );
}

// 5. Verification of MutationObserver binding on documentElement during full boot
{
  const { mockDocument } = runTestWithEnvironment();
  assert.equal(
    mockDocument.documentElement.dataset.uploadedThemeObserveBound,
    "true",
    "uploadedThemeObserveBound dataset flag must be set to true on documentElement"
  );
}

console.log("updateThemeIcon runtime compatibility and theme icon attribute mapping validated.");

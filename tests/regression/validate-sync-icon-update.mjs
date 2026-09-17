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

  const mockIconNode = options.hasIconNode !== false ? {
    tagName: "DIV",
    dataset: options.initialIconDataset ? { ...options.initialIconDataset } : {}
  } : null;

  const mockButtonNode = options.hasButtonNode !== false ? {
    tagName: "BUTTON",
    dataset: options.initialButtonDataset ? { ...options.initialButtonDataset } : {},
    querySelector: (selector) => {
      if (selector === ".toolbar-icon") return mockIconNode;
      return null;
    }
  } : null;

  if (mockButtonNode) {
    elements.set("cloudSyncStatusButton", mockButtonNode);
  }

  const docElement = {
    dataset: {},
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
      return {
        tagName: tag.toUpperCase(),
        dataset: {},
        style: { setProperty: () => {} },
        setAttribute: (_k, _v) => {},
        before: () => {},
        appendChild: () => {},
        closest: () => null,
        querySelector: () => null,
        insertAdjacentHTML: () => {}
      };
    },
    querySelectorAll: () => []
  };

  const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {}
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

  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    MutationObserver: MockMutationObserver,
    queueMicrotask: (fn) => fn(),
    URL: globalThis.URL
  });

  vm.runInContext(runtimeSource, context);

  return { mockWindow, mockDocument, elements, mockButtonNode, mockIconNode };
}

// 1. Missing button or icon handles safely without error
{
  const test1 = runTestWithEnvironment({ hasButtonNode: false });
  assert.equal(test1.elements.get("cloudSyncStatusButton"), undefined);

  const test2 = runTestWithEnvironment({ hasButtonNode: true, hasIconNode: false });
  assert.notEqual(test2.mockButtonNode, null);
  assert.equal(test2.mockIconNode, null);
}

// 2. data-sync-state attribute mapping tests
const syncStateCases = [
  { state: "syncing", expectedIconState: "syncing" },
  { state: "needs-sync", expectedIconState: "needs-sync" },
  { state: "sync-issue", expectedIconState: "offline" },
  { state: "offline", expectedIconState: "offline" },
  { state: "synced", expectedIconState: "synced" }
];

for (const { state, expectedIconState } of syncStateCases) {
  const { mockIconNode } = runTestWithEnvironment({
    initialButtonDataset: { syncState: state }
  });
  assert.equal(
    mockIconNode.dataset.uploadedSyncIcon,
    expectedIconState,
    `data-sync-state "${state}" should map dataset.uploadedSyncIcon to "${expectedIconState}"`
  );
}

// 3. Handling empty, missing, or unmapped data-sync-state removes uploadedSyncIcon attribute
const unmappedCases = ["", undefined, "unknown", "idle", "disabled"];

for (const state of unmappedCases) {
  const initialButtonDataset = state !== undefined ? { syncState: state } : {};
  const { mockIconNode } = runTestWithEnvironment({
    initialButtonDataset,
    initialIconDataset: { uploadedSyncIcon: "synced" } // Preset icon dataset
  });

  assert.equal(
    mockIconNode.dataset.uploadedSyncIcon,
    undefined,
    `data-sync-state "${state}" should delete uploadedSyncIcon property`
  );
}

// 4. MutationObserver binding on #cloudSyncStatusButton
{
  const { mockButtonNode } = runTestWithEnvironment({
    initialButtonDataset: { syncState: "synced" }
  });
  assert.equal(
    mockButtonNode.dataset.uploadedIconObserveBound,
    "true",
    "uploadedIconObserveBound dataset flag must be set to 'true' on cloudSyncStatusButton"
  );
}

console.log("updateSyncIcon runtime compatibility and sync icon attribute mapping validated.");

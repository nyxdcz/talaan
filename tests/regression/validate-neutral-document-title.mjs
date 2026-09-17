import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runtimeSource = fs.readFileSync(path.join(root, "assets/js/ui/sync-runtime-compat.js"), "utf8");

function runTestWithTitle(initialTitle, options = {}) {
  let currentTitle = initialTitle;

  const mockDocument = {
    get title() {
      return currentTitle;
    },
    set title(val) {
      currentTitle = val;
    },
    documentElement: {
      dataset: {},
      querySelectorAll: () => [],
      closest: () => null
    },
    head: {
      appendChild: () => {},
      lastElementChild: null
    },
    readyState: options.readyState || "complete",
    addEventListener: (event, listener) => {
      if (options.readyState === "loading" && event === "DOMContentLoaded" && options.triggerDOMContentLoaded) {
        listener();
      }
    },
    getElementById: () => null,
    createElement: () => ({
      tagName: "DIV",
      dataset: {},
      style: { setProperty: () => {} },
      setAttribute: () => {},
      before: () => {},
      appendChild: () => {},
      closest: () => null,
      querySelector: () => null,
      insertAdjacentHTML: () => {}
    }),
    querySelectorAll: () => []
  };

  class MockMutationObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  }

  const mockWindow = {
    location: { href: "http://localhost/" },
    document: mockDocument,
    localStorage: { getItem: () => null, setItem: () => {} },
    MutationObserver: MockMutationObserver,
    queueMicrotask: (fn) => fn()
  };

  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockWindow.localStorage,
    MutationObserver: MockMutationObserver,
    queueMicrotask: mockWindow.queueMicrotask,
    URL: globalThis.URL
  });

  vm.runInContext(runtimeSource, context);

  return { mockDocument, getTitle: () => currentTitle };
}

// 1. Initial non-standard title is immediately reset to "Talaan"
{
  const nonStandardTitles = [
    "Custom Title",
    "",
    "Talaan - Dashboard",
    "Finance App",
    "Untitled Document"
  ];

  for (const title of nonStandardTitles) {
    const { getTitle } = runTestWithTitle(title);
    assert.equal(
      getTitle(),
      "Talaan",
      `Document title "${title}" should be reset to "Talaan"`
    );
  }
}

// 2. Initial title already set to "Talaan" remains "Talaan"
{
  const { getTitle } = runTestWithTitle("Talaan");
  assert.equal(getTitle(), "Talaan", 'Document title already "Talaan" should remain unchanged');
}

// 3. Document readyState "loading" attaches DOMContentLoaded listener and resets title upon DOMContentLoaded
{
  const { getTitle } = runTestWithTitle("Draft Title", {
    readyState: "loading",
    triggerDOMContentLoaded: true
  });
  assert.equal(
    getTitle(),
    "Talaan",
    'Document title should be reset to "Talaan" on DOMContentLoaded when readyState was "loading"'
  );
}

console.log("preserveNeutralDocumentTitle runtime compatibility and document title preservation validated.");

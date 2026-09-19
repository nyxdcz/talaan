import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runtimeSource = fs.readFileSync(path.join(root, "assets/js/ui/sync-runtime-compat.js"), "utf8");

const testableRuntimeSource = runtimeSource.replace(
  "function boot() {",
  "window.ensureWorkMarquee = ensureWorkMarquee; window.workMarqueeMarkup = workMarqueeMarkup; function boot() {"
);

function createMockElement(id = "", tagName = "DIV") {
  const children = [];
  const dataset = {};
  const classes = new Set();
  let parent = null;
  let insertedHTML = [];

  const el = {
    id,
    tagName: tagName.toUpperCase(),
    dataset,
    style: { setProperty: () => {} },
    get parent() {
      return parent;
    },
    set parent(p) {
      parent = p;
    },
    get className() {
      return Array.from(classes).join(" ");
    },
    set className(val) {
      classes.clear();
      if (val) val.split(/\s+/).forEach(c => classes.add(c));
    },
    get children() {
      return children;
    },
    get insertedHTML() {
      return insertedHTML;
    },
    resetInsertedHTML() {
      insertedHTML = [];
    },
    setAttribute: (k, v) => { el[k] = v; },
    getAttribute: (k) => el[k] ?? null,
    appendChild: (child) => {
      child.parent = el;
      children.push(child);
      return child;
    },
    before: (node) => {
      if (el.parent) {
        node.parent = el.parent;
        const idx = el.parent.children.indexOf(el);
        if (idx !== -1) el.parent.children.splice(idx, 0, node);
      }
    },
    closest: (selector) => {
      let current = el;
      while (current) {
        if (selector === ".work-workspace-marquee-row" && current.className?.includes("work-workspace-marquee-row")) {
          return current;
        }
        current = current.parent || null;
      }
      return null;
    },
    querySelector: (selector) => {
      const targetClass = selector.startsWith(".") ? selector.slice(1) : selector;
      const queue = [...children];
      while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.className?.includes(targetClass)) return curr;
        if (curr.children) queue.push(...curr.children);
      }
      return el._switcher || null;
    },
    querySelectorAll: () => [],
    insertAdjacentHTML: (position, html) => {
      insertedHTML.push({ position, html });
    }
  };

  return el;
}

function setupEnvironment() {
  const elements = new Map();
  let createdElementsCount = 0;

  const docElement = createMockElement("", "HTML");
  const head = createMockElement("", "HEAD");

  const mockDocument = {
    title: "Talaan",
    documentElement: docElement,
    head: head,
    readyState: "complete",
    addEventListener: () => {},
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      createdElementsCount++;
      const el = createMockElement("", tag);
      return el;
    },
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

  vm.runInContext(testableRuntimeSource, context);

  return {
    context,
    mockWindow,
    mockDocument,
    elements,
    ensureWorkMarquee: mockWindow.ensureWorkMarquee,
    workMarqueeMarkup: mockWindow.workMarqueeMarkup,
    getCreatedCount: () => createdElementsCount
  };
}

// 1. Missing page or switcher returns early without DOM modifications
{
  const { ensureWorkMarquee, elements, getCreatedCount } = setupEnvironment();

  const countAfterBoot = getCreatedCount();

  // Test non-existent page
  const res1 = ensureWorkMarquee("nonExistentPage");
  assert.equal(res1, undefined);
  assert.equal(getCreatedCount(), countAfterBoot, "No elements created for non-existent page");

  // Test empty page (no switcher)
  const emptyPage = createMockElement("emptyPage");
  elements.set("emptyPage", emptyPage);
  const res2 = ensureWorkMarquee("emptyPage");
  assert.equal(res2, undefined);
  assert.equal(getCreatedCount(), countAfterBoot, "No elements created when switcher missing");
}

// 2. Page and switcher exist without wrapper row: creates wrapper row and inserts marquee markup
{
  const { ensureWorkMarquee, workMarqueeMarkup, elements } = setupEnvironment();

  const projectsPage = createMockElement("projects");
  const switcher = createMockElement("", "DIV");
  switcher.className = "project-workspace-switcher";
  projectsPage.appendChild(switcher);

  elements.set("projects", projectsPage);

  ensureWorkMarquee("projects");

  const row = switcher.parent;
  assert.ok(row, "Switcher should have a parent element");
  assert.equal(row.className, "finance-workspace-marquee-row work-workspace-marquee-row no-print");
  assert.equal(row.parent, projectsPage, "Row wrapper should be child of projects page");
  assert.ok(row.children.includes(switcher), "Row wrapper should contain switcher");

  const expectedMarkup = workMarqueeMarkup("projects");
  assert.ok(row.insertedHTML.length >= 1);
  const lastInserted = row.insertedHTML[row.insertedHTML.length - 1];
  assert.equal(lastInserted.position, "beforeend");
  assert.equal(lastInserted.html, expectedMarkup);
  assert.ok(lastInserted.html.includes('id="projectsWorkWeekMarquee"'));
  assert.ok(lastInserted.html.includes('id="projectsWorkWeekMarqueeTitle"'));
  assert.ok(lastInserted.html.includes('id="projectsWorkWeekMarqueeTrack"'));
}

// 3. Page and switcher exist within existing wrapper row: reuses row without creating new div
{
  const { ensureWorkMarquee, workMarqueeMarkup, elements, getCreatedCount } = setupEnvironment();

  const paymentsPage = createMockElement("payments");
  const existingRow = createMockElement("", "DIV");
  existingRow.className = "finance-workspace-marquee-row work-workspace-marquee-row no-print";

  const switcher = createMockElement("", "DIV");
  switcher.className = "project-workspace-switcher";

  paymentsPage.appendChild(existingRow);
  existingRow.appendChild(switcher);

  elements.set("payments", paymentsPage);

  const countBefore = getCreatedCount();

  ensureWorkMarquee("payments");

  assert.equal(getCreatedCount(), countBefore, "Should not create a new wrapper div if row already exists");
  assert.equal(switcher.parent, existingRow, "Switcher remains in existing row");

  const expectedMarkup = workMarqueeMarkup("payments");
  assert.ok(existingRow.insertedHTML.length >= 1);
  const lastInserted = existingRow.insertedHTML[existingRow.insertedHTML.length - 1];
  assert.equal(lastInserted.html, expectedMarkup);
  assert.ok(lastInserted.html.includes('id="paymentsWorkWeekMarquee"'));
}

// 4. Idempotency: when marquee element already exists in document, no markup is inserted
{
  const { ensureWorkMarquee, elements } = setupEnvironment();

  const projectsPage = createMockElement("projects");
  const row = createMockElement("", "DIV");
  row.className = "work-workspace-marquee-row";
  const switcher = createMockElement("", "DIV");
  switcher.className = "project-workspace-switcher";
  const marquee = createMockElement("projectsWorkWeekMarquee");

  projectsPage.appendChild(row);
  row.appendChild(switcher);
  row.appendChild(marquee);

  elements.set("projects", projectsPage);
  elements.set("projectsWorkWeekMarquee", marquee);

  row.resetInsertedHTML();

  ensureWorkMarquee("projects");

  assert.equal(row.insertedHTML.length, 0, "No HTML inserted when marquee already exists");
}

console.log("ensureWorkMarquee DOM manipulation and lifecycle validated.");

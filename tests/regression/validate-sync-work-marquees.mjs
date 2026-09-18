import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runtimeSource = fs.readFileSync(path.join(root, "assets/js/ui/sync-runtime-compat.js"), "utf8");

function createMockElement(id = "", tagName = "DIV") {
  let innerHTMLValue = "";
  let textContentValue = "";
  let innerHTMLSetCount = 0;
  let textContentSetCount = 0;
  const children = [];
  const dataset = {};
  const classes = new Set();

  const el = {
    id,
    tagName: tagName.toUpperCase(),
    dataset,
    style: { setProperty: () => {} },
    get className() {
      return Array.from(classes).join(" ");
    },
    set className(val) {
      classes.clear();
      if (val) val.split(/\s+/).forEach(c => classes.add(c));
    },
    get innerHTML() {
      return innerHTMLValue;
    },
    set innerHTML(val) {
      innerHTMLSetCount++;
      innerHTMLValue = String(val);
    },
    get textContent() {
      return textContentValue;
    },
    set textContent(val) {
      textContentSetCount++;
      textContentValue = String(val);
    },
    get innerHTMLSetCount() {
      return innerHTMLSetCount;
    },
    get textContentSetCount() {
      return textContentSetCount;
    },
    resetCounts: () => {
      innerHTMLSetCount = 0;
      textContentSetCount = 0;
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
      if (selector === ".project-workspace-switcher") {
        return children.find(c => c.className?.includes("project-workspace-switcher")) || el._switcher || null;
      }
      return null;
    },
    querySelectorAll: () => [],
    insertAdjacentHTML: (position, html) => {
      el._insertedHTML = (el._insertedHTML || "") + html;
    },
    children
  };

  return el;
}

function setupEnvironment(options = {}) {
  const elements = new Map();

  const docElement = createMockElement("", "HTML");
  const head = createMockElement("", "HEAD");

  const mockDocument = {
    title: "Talaan",
    documentElement: docElement,
    head: head,
    readyState: options.readyState || "complete",
    addEventListener: () => {},
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      const el = createMockElement("", tag);
      if (options.onElementCreated) options.onElementCreated(el, elements);
      return el;
    },
    querySelectorAll: () => []
  };

  let observerInstance = null;
  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observerInstance = this;
    }
    observe(target, obsOptions) {
      this.target = target;
      this.options = obsOptions;
    }
    disconnect() {
      this.disconnected = true;
    }
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
    queueMicrotask: (fn) => fn(),
    URL: globalThis.URL
  });

  return { context, mockWindow, mockDocument, elements, getObserver: () => observerInstance };
}

// Scenario 1: Early exit when dashboardWeekMarqueeTrack source element does not exist
{
  const { context, elements } = setupEnvironment();
  // Target marquees exist, but dashboard source track does NOT exist
  const projectsTrack = createMockElement("projectsWorkWeekMarqueeTrack");
  projectsTrack.innerHTML = "<p>Old Projects Content</p>";
  projectsTrack.resetCounts();
  elements.set("projectsWorkWeekMarqueeTrack", projectsTrack);

  vm.runInContext(runtimeSource, context);

  // syncWorkMarquees should exit early without altering projectsTrack
  assert.equal(projectsTrack.innerHTML, "<p>Old Projects Content</p>");
  assert.equal(projectsTrack.innerHTMLSetCount, 0, "innerHTML should not be assigned when source is absent");
}

// Scenario 2: ensureWorkMarquee builds workspace marquee container and inserts markup
{
  const { context, elements } = setupEnvironment();

  // Set up source marquee so boot completes without errors
  const sourceTrack = createMockElement("dashboardWeekMarqueeTrack");
  sourceTrack.innerHTML = "<span>Source Schedule</span>";
  elements.set("dashboardWeekMarqueeTrack", sourceTrack);

  const sourceRange = createMockElement("dashboardWeekMarqueeRange");
  sourceRange.textContent = "May 1 - May 7";
  elements.set("dashboardWeekMarqueeRange", sourceRange);

  // Set up projects page structure
  const projectsPage = createMockElement("projects");
  const switcher = createMockElement("", "DIV");
  switcher.className = "project-workspace-switcher";
  projectsPage.appendChild(switcher);
  elements.set("projects", projectsPage);

  vm.runInContext(runtimeSource, context);

  // verify row wrapper created and switcher moved inside row
  assert.ok(switcher.parent, "Switcher should have parent row container");
  assert.ok(switcher.parent.className.includes("work-workspace-marquee-row"));
  assert.ok(switcher.parent._insertedHTML.includes('id="projectsWorkWeekMarquee"'));
}

// Scenario 3: syncWorkMarquees synchronizes innerHTML and textContent to target marquees
{
  const { context, elements } = setupEnvironment();

  // Source elements
  const sourceTrack = createMockElement("dashboardWeekMarqueeTrack");
  sourceTrack.innerHTML = '<div class="day">Mon: $100</div><div class="day">Tue: $200</div>';
  elements.set("dashboardWeekMarqueeTrack", sourceTrack);

  const sourceRange = createMockElement("dashboardWeekMarqueeRange");
  sourceRange.textContent = "Oct 12 - Oct 18, 2025";
  elements.set("dashboardWeekMarqueeRange", sourceRange);

  // Target elements for projects and payments
  const projectsTrack = createMockElement("projectsWorkWeekMarqueeTrack");
  const projectsRange = createMockElement("projectsWorkWeekMarqueeRange");
  const paymentsTrack = createMockElement("paymentsWorkWeekMarqueeTrack");
  const paymentsRange = createMockElement("paymentsWorkWeekMarqueeRange");

  elements.set("projectsWorkWeekMarqueeTrack", projectsTrack);
  elements.set("projectsWorkWeekMarqueeRange", projectsRange);
  elements.set("paymentsWorkWeekMarqueeTrack", paymentsTrack);
  elements.set("paymentsWorkWeekMarqueeRange", paymentsRange);

  vm.runInContext(runtimeSource, context);

  // Assert both projects and payments targets were synced
  assert.equal(projectsTrack.innerHTML, sourceTrack.innerHTML);
  assert.equal(projectsRange.textContent, sourceRange.textContent);
  assert.equal(paymentsTrack.innerHTML, sourceTrack.innerHTML);
  assert.equal(paymentsRange.textContent, sourceRange.textContent);
}

// Scenario 4: Idempotency - syncWorkMarquees skips setting innerHTML/textContent when already identical
{
  const { context, elements } = setupEnvironment();

  const sourceTrack = createMockElement("dashboardWeekMarqueeTrack");
  sourceTrack.innerHTML = '<span>Identical Content</span>';
  elements.set("dashboardWeekMarqueeTrack", sourceTrack);

  const sourceRange = createMockElement("dashboardWeekMarqueeRange");
  sourceRange.textContent = "Jan 1 - Jan 7";
  elements.set("dashboardWeekMarqueeRange", sourceRange);

  const projectsTrack = createMockElement("projectsWorkWeekMarqueeTrack");
  projectsTrack.innerHTML = '<span>Identical Content</span>';
  projectsTrack.resetCounts();
  elements.set("projectsWorkWeekMarqueeTrack", projectsTrack);

  const projectsRange = createMockElement("projectsWorkWeekMarqueeRange");
  projectsRange.textContent = "Jan 1 - Jan 7";
  projectsRange.resetCounts();
  elements.set("projectsWorkWeekMarqueeRange", projectsRange);

  vm.runInContext(runtimeSource, context);

  assert.equal(
    projectsTrack.innerHTMLSetCount,
    0,
    "Track innerHTML should not be re-set when already identical"
  );
  assert.equal(
    projectsRange.textContentSetCount,
    0,
    "Range textContent should not be re-set when already identical"
  );
}

// Scenario 5: MutationObserver setup and reactivity when dashboardWeekMarquee changes
{
  const { context, elements, getObserver } = setupEnvironment();

  const sourceMarquee = createMockElement("dashboardWeekMarquee");
  elements.set("dashboardWeekMarquee", sourceMarquee);

  const sourceTrack = createMockElement("dashboardWeekMarqueeTrack");
  sourceTrack.innerHTML = "<span>Initial</span>";
  elements.set("dashboardWeekMarqueeTrack", sourceTrack);

  const sourceRange = createMockElement("dashboardWeekMarqueeRange");
  sourceRange.textContent = "Week 1";
  elements.set("dashboardWeekMarqueeRange", sourceRange);

  const projectsTrack = createMockElement("projectsWorkWeekMarqueeTrack");
  elements.set("projectsWorkWeekMarqueeTrack", projectsTrack);

  const projectsRange = createMockElement("projectsWorkWeekMarqueeRange");
  elements.set("projectsWorkWeekMarqueeRange", projectsRange);

  vm.runInContext(runtimeSource, context);

  const observer = getObserver();
  assert.ok(observer, "MutationObserver should be initialized");
  assert.equal(observer.target, sourceMarquee, "Observer should monitor dashboardWeekMarquee");
  assert.equal(observer.options.childList, true);
  assert.equal(observer.options.subtree, true);
  assert.equal(observer.options.characterData, true);

  // Simulate source updates and observer mutation callback execution
  sourceTrack.innerHTML = "<span>Updated Schedule</span>";
  sourceRange.textContent = "Week 2";

  // Trigger mutation observer callback
  observer.callback();

  assert.equal(projectsTrack.innerHTML, "<span>Updated Schedule</span>");
  assert.equal(projectsRange.textContent, "Week 2");
}

console.log("syncWorkMarquees runtime synchronization and DOM marquee lifecycle validated.");

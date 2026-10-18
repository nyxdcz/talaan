import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const worker = fs.readFileSync("sw.js", "utf8");
const updater = fs.readFileSync("pwa-update.js", "utf8");
const origin = "https://example.test/talaan/";
const prefix = "finance-v2-20260828-household-splits-r17";
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function cacheStorage() {
  const stores = new Map();
  return {
    scans:0,
    async keys() { this.scans += 1; return [...stores.keys()]; },
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          async match(request) { return entries.get(request.url || request)?.clone(); },
          async put(request, response) { entries.set(request.url || request, response.clone()); },
          async keys() { return [...entries.keys()].map(url => new Request(url)); },
          async delete(request) { return entries.delete(request.url || request); }
        });
      }
      return stores.get(name);
    }
  };
}
function workerFixture(fetch) {
  const caches = cacheStorage();
  const handlers = {};
  vm.runInNewContext(worker, { URL, Request, Response, setTimeout, clearTimeout, caches, fetch,
    self:{ registration:{ scope:origin }, location:{ origin:new URL(origin).origin }, addEventListener(type, callback) { handlers[type] = callback; } }
  });
  return { caches, request(path, mode = "cors") {
    const background = [];
    let response;
    handlers.fetch({ request:{ url:new URL(path, origin).href, method:"GET", mode },
      waitUntil(promise) { background.push(promise); }, respondWith(promise) { response = promise; }
    });
    return { response, background:() => Promise.all(background) };
  } };
}

// A slow revalidation must finish in the background, including the cache write.
{
  const download = deferred();
  const fixture = workerFixture(() => download.promise);
  const runtime = await fixture.caches.open(`${prefix}-runtime`);
  const url = new URL("phone-scale.css?v=current", origin).href;
  await runtime.put(url, new Response("cached"));
  const request = fixture.request("phone-scale.css?v=current");
  const result = await Promise.race([request.response, new Promise((_, reject) => setTimeout(() => reject(new Error("Cached startup waited for the stalled network")), 1500))]);
  assert.equal(await result.text(), "cached");
  download.resolve(new Response("fresh"));
  await request.background();
  assert.equal(await (await runtime.match(url)).text(), "fresh");
}
for (const failure of [() => Promise.reject(new Error("offline")), () => Promise.resolve(new Response("bad gateway", { status:502 }))]) {
  const fixture = workerFixture(failure);
  const shell = await fixture.caches.open(`${prefix}-shell`);
  await shell.put(new URL("index.html", origin).href, new Response("cached shell"));
  await shell.put(new URL("phone-scale.css?v=current", origin).href, new Response("cached CSS"));
  assert.equal(await (await fixture.request("?page=money", "navigate").response).text(), "cached shell");
  assert.equal(await (await fixture.request("phone-scale.css?v=current").response).text(), "cached CSS");
  const missing = await fixture.request("phone-scale.css?v=missing").response;
  assert.ok([502,503].includes(missing.status), "a different revision must not reuse old CSS");
}
{
  const download = deferred();
  const fixture = workerFixture(() => download.promise);
  const shell = await fixture.caches.open(`${prefix}-shell`);
  await shell.put(new URL("phone-scale.css?v=old", origin).href, new Response("old revision"));
  const request = fixture.request("phone-scale.css?v=new");
  let settled = false;
  void request.response.then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(settled, false, "cold or revised assets must wait for their own download");
  download.resolve(new Response("new revision"));
  assert.equal(await (await request.response).text(), "new revision");
  await request.background();
}
{
  const fixture = workerFixture(() => Promise.resolve(new Response("fresh")));
  const runtime = await fixture.caches.open(`${prefix}-runtime`);
  runtime.put = async () => { throw new Error("quota"); };
  assert.equal(await (await fixture.request("phone-scale.css?v=current").response).text(), "fresh");
}

{
  const fixture = workerFixture(() => Promise.resolve(new Response("fresh without storage")));
  fixture.caches.open = async () => { throw new Error("storage unavailable"); };
  assert.equal(await (await fixture.request("phone-scale.css?v=current").response).text(), "fresh without storage");
}

const refreshKeys = [...updater.matchAll(/const [A-Z_]+REFRESH_KEY = "([^"]+)";/g)].map(match => match[1]);
const storage = new Map([["saved-finance-profile", "unchanged"]]);
async function runUpdater(caches, { offline = false } = {}) {
  let reloads = 0;
  vm.runInNewContext(updater, { URL, caches, navigator:{ serviceWorker:{ controller:{} }, onLine:!offline },
    localStorage:{ getItem:key => storage.get(key), setItem:(key, value) => storage.set(key, value) },
    location:{ reload() { reloads += 1; } }
  });
  await new Promise(resolve => setImmediate(resolve));
  return reloads;
}
{
  const caches = cacheStorage();
  const cache = await caches.open(`${prefix}-runtime`);
  for (const file of ["index.html", "phone-finance-compat.js", "brand-icons.js", "budget-planning.js", "account-ledger.js"]) {
    await cache.put(new URL(`${file}?old`, origin).href, new Response("stale"));
  }
  const unrelated = await caches.open("other-application");
  await unrelated.put(new URL("index.html", origin).href, new Response("keep"));
  assert.equal(await runUpdater(caches, { offline:true }), 0);
  assert.equal(caches.scans, 0, "offline startup must preserve the cached shell for next opening");
  assert.equal(refreshKeys.some(key => storage.has(key)), false);
  assert.equal(await runUpdater(caches), 1, "all pending refresh groups must share one reload");
  assert.equal(caches.scans, 1, "all refresh groups must share one cache scan");
  assert.equal((await cache.keys()).length, 0);
  assert.equal((await unrelated.keys()).length, 1);
  assert.ok(refreshKeys.every(key => storage.get(key) === "done"));
  assert.equal(storage.get("saved-finance-profile"), "unchanged");
  assert.equal(await runUpdater(caches), 0);
  assert.equal(caches.scans, 1, "completed markers must avoid rescanning on every opening");
}
{
  for (const key of refreshKeys) storage.delete(key);
  assert.equal(await runUpdater({ keys:async () => { throw new Error("cache unavailable"); } }), 0);
  assert.equal(refreshKeys.some(key => storage.has(key)), false, "failed refreshes must remain retryable");
  assert.equal(await runUpdater(cacheStorage()), 0, "an empty cache must not cause a reload loop");
  assert.ok(refreshKeys.every(key => storage.get(key) === "done"));
}
console.log("Cached startup deadlines, background updates, revision isolation, offline/error fallback, and one-pass upgrades validated.");

"use strict";
(function exposeFinancePwaUpdate(root) {
  const FINANCE_CACHE_PATTERN = /^finance-v\d+-/;
  // Compatibility-only cache identity used to upgrade clients installed before Talaan V2.
  const LEGACY_INDEX_CACHE = "finance-v15-20260816-mobile-ui-ux-r32";
  const CURRENT_CACHE_VERSION = "finance-v2-20260828-household-splits-r17";
  const UI_HOTFIX_REFRESH_KEY = "finance-ui-hotfix-v2-0-1-talaan18";
  const DASHBOARD_PRESENTATION_REFRESH_KEY = "finance-dashboard-presentation-v2-5-0-talaan9";
  const EXPENSE_DARK_MODE_REFRESH_KEY = "finance-expense-dark-mode-v2-5-0-talaan1";
  const INCOME_PLANNING_REFRESH_KEY = "finance-income-planning-v2-5-0-talaan1";
  const ACCOUNT_INTEGRITY_REFRESH_KEY = "finance-account-integrity-runtime";
  const ACCOUNT_INTEGRITY_ASSET_QUERY = "2.5.0-account-runtime";
  const normalizeCacheVersion = cacheVersion => cacheVersion === LEGACY_INDEX_CACHE ? CURRENT_CACHE_VERSION : cacheVersion;

  async function installBrowserBrandIcons() {
    try {
      await import("./brand-icons.js?v=2.5.0-talaan1");
      return true;
    } catch (error) {
      return false;
    }
  }

  async function installAccountSubmitCompat() {
    try {
      await import(`./account-submit-compat.js?v=${ACCOUNT_INTEGRITY_ASSET_QUERY}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  const refreshGroups = [
    { key:UI_HOTFIX_REFRESH_KEY, paths:[
        "/index.html",
        "/interaction-patterns.js",
        "/header-tools-compat.js",
        "/cash-flow-summary.js",
        "/desktop-ui-phase1.css",
        "/black-canvas.css",
        "/production-ui-audit.css",
        "/expense-compact.css",
        "/ui-icon-alignment.css",
        "/ui-radius.css",
        "/phone-scale.css",
        "/income-expenses-compact.css",
        "/phone-finance-compat.js",
        "/form-inputs.js",
        "/productivity-tools.js",
        "/transaction-views.js",
        "/sidebar-compact-brand.css",
        "/talaan-brand-logo.png"
    ] },
    { key:DASHBOARD_PRESENTATION_REFRESH_KEY, paths:[
        "/brand-icons.js",
        "/income-expenses-compact.css",
        "/production-ui-audit.css"
    ] },
    { key:EXPENSE_DARK_MODE_REFRESH_KEY, paths:[
        "/phone-finance-compat.js"
    ] },
    { key:INCOME_PLANNING_REFRESH_KEY, paths:[
        "/budget-planning.js",
        "/productivity-tools.js",
        "/application-help.js",
        "/desktop-ux.css"
    ] },
    { key:ACCOUNT_INTEGRITY_REFRESH_KEY, paths:[
        "/finance-transaction-diagnostics.js",
        "/finance-integrity.js",
        "/account-ledger.js",
        "/account-submit-compat.js",
        "/cloud-sync.js",
        "/cloud-sync-lifecycle.js"
    ] }
  ];

  async function refreshCachedRuntimeOnce() {
    if (!root.navigator?.serviceWorker?.controller || root.navigator.onLine === false || !("caches" in root)) return false;
    try {
      const pending = refreshGroups.filter(group => root.localStorage?.getItem(group.key) !== "done");
      if (!pending.length) return false;
      const pathnames = [...new Set(pending.flatMap(group => group.paths))];
      const cacheNames = (await root.caches.keys()).filter(name => FINANCE_CACHE_PATTERN.test(name));
      const deletedCounts = await Promise.all(cacheNames.map(async cacheName => {
        const cache = await root.caches.open(cacheName);
        const requests = await cache.keys();
        const targets = requests.filter(request => {
          const pathname = new URL(request.url).pathname;
          return pathnames.some(suffix => pathname.endsWith(suffix));
        });
        const deleted = await Promise.all(targets.map(request => cache.delete(request)));
        return deleted.filter(Boolean).length;
      }));
      const removed = deletedCounts.reduce((sum, count) => sum + count, 0);
      for (const group of pending) root.localStorage?.setItem(group.key, "done");
      if (!removed) return false;
      root.location.reload();
      return true;
    } catch (error) {
      return false;
    }
  }

  const api = {
    financeCachePattern:FINANCE_CACHE_PATTERN,
    accountIntegrityRefreshKey:ACCOUNT_INTEGRITY_REFRESH_KEY,
    accountIntegrityAssetQuery:ACCOUNT_INTEGRITY_ASSET_QUERY,
    shellCacheName(cacheVersion) { return `${normalizeCacheVersion(cacheVersion)}-shell`; },
    serviceWorkerUrl(version, cacheVersion) {
      const normalizedCache = normalizeCacheVersion(cacheVersion);
      return `./sw.js?v=${encodeURIComponent(version)}&cache=${encodeURIComponent(normalizedCache)}`;
    },
    updateState(remote, version, cacheVersion) {
      const normalizedCache = normalizeCacheVersion(cacheVersion);
      return {
        versionChanged:Boolean(remote?.version && remote.version !== version),
        cacheChanged:Boolean(remote?.cacheVersion && remote.cacheVersion !== normalizedCache)
      };
    },
    async clearFinanceCaches() {
      if (!("caches" in root)) return 0;
      const keys = await root.caches.keys();
      const targets = keys.filter(key => FINANCE_CACHE_PATTERN.test(key));
      await Promise.all(targets.map(key => root.caches.delete(key)));
      return targets.length;
    }
  };
  root.FinancePwaUpdate = api;
  void installBrowserBrandIcons();
  void refreshCachedRuntimeOnce().then(refreshed => {
    if (!refreshed) void installAccountSubmitCompat();
  });
})(typeof window !== "undefined" ? window : globalThis);

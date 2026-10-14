import fs from "node:fs";
import { test as base, expect } from "@playwright/test";

const updater = fs.readFileSync(new URL("../../pwa-update.js", import.meta.url), "utf8");
export const refreshKeys = [...updater.matchAll(/const [A-Z_]+REFRESH_KEY = "([^"]+)";/g)].map(match => match[1]);
if (refreshKeys.length !== 5) throw new Error("Expected all five prepared PWA refresh markers");

export const test = base.extend({
  hostedCloud:[false, { option:true }],
  legacyPwaRefresh:[false, { option:true }],
  context:async ({ context, hostedCloud, legacyPwaRefresh }, use) => {
    await context.addInitScript(({ hostedCloud, legacyPwaRefresh, refreshKeys }) => {
      // UI tests unlock synthetic records; a late hosted session restore would lock them again.
      if (!hostedCloud) window.FINANCE_SYNC_CONFIG ||= { supabaseUrl:"", supabasePublishableKey:"" };
      // Ordinary cases model an updated installation. Upgrade cases opt into real refreshes.
      if (!legacyPwaRefresh) for (const key of refreshKeys) localStorage.setItem(key, "done");
    }, { hostedCloud, legacyPwaRefresh, refreshKeys });
    await use(context);
  }
});

export { expect };

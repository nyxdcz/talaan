import { test, expect } from "@playwright/test";

test("cloud startup creates one client and preserves an existing locked profile", async ({ page }) => {
  const consoleNoise = [];
  page.on("console", message => {
    if (["warning", "error"].includes(message.type())) consoleNoise.push(message.text());
  });

  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(() => {
    window.data = {};
    window.FINANCE_SYNC_CONFIG = {
      supabaseUrl:"https://example.supabase.co",
      supabasePublishableKey:"sb_publishable_abcdefghijklmnopqrstuvwxyz"
    };
    window.__cloudTest = { clients:0, listeners:0, connects:0, creates:0 };
    window.FinanceCloudSyncLifecycle = {
      create:() => ({
        clearForegroundPoll() {}, scheduleForegroundPoll() {}, clearRealtimeRetry() {},
        scheduleRealtimeRecovery() {}, noteRealtimeSubscribed() {}
      })
    };
    window.FinanceProfileArchitecture = {
      activeProfileId:() => "profile-personal",
      activeProfile:() => ({ name:"Personal", type:"personal", encryption:{ enabled:false } }),
      cloudProfileId:() => "",
      isCloudUnlocked:() => false,
      listCloudProfiles:async () => ({ profiles:[{ profile_id:"existing-profile" }] }),
      connectCloudProfile:async () => { window.__cloudTest.connects += 1; throw new Error("Incorrect passphrase"); },
      createCloudProfile:async () => { window.__cloudTest.creates += 1; }
    };
    window.financeLoadSupabase = async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return {
        createClient:() => {
          window.__cloudTest.clients += 1;
          return {
            auth:{
              onAuthStateChange:() => { window.__cloudTest.listeners += 1; },
              getSession:async () => ({ data:{ session:{ user:{ id:"user-1", email:"person@example.com" } } }, error:null })
            }
          };
        }
      };
    };
  });

  await page.addScriptTag({ path:"assets/js/cloud-sync.js" });
  await page.evaluate(() => Promise.all(Array.from({ length:8 }, () => window.FinanceCloudSyncInternals.loadClient())));
  await expect.poll(() => page.evaluate(() => window.FinanceCloudSyncInternals.cloudReadiness().key)).toBe("profile-locked");

  const result = await page.evaluate(() => ({ ...window.__cloudTest, readiness:window.FinanceCloudSyncInternals.cloudReadiness() }));
  expect(result.clients).toBe(1);
  expect(result.listeners).toBe(1);
  expect(result.connects).toBe(1);
  expect(result.creates).toBe(0);
  expect(result.readiness.label).toBe("Unlock profile");
  expect(consoleNoise).toEqual([]);
});

test("cloud startup keeps the privacy gate open while a saved session hydrates", async ({ page }) => {
  const consoleNoise = [];
  page.on("console", message => {
    if (["warning", "error"].includes(message.type())) consoleNoise.push(message.text());
  });

  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(() => {
    window.data = {};
    window.FINANCE_SYNC_CONFIG = {};
    window.__cloudTest = { attempts:0, sessionReads:0, privacy:[] };
    window.FinancePrivacyLock = {
      setAuthenticated(value) { window.__cloudTest.privacy.push(Boolean(value)); }
    };
    window.FinanceCloudSyncLifecycle = {
      create:() => ({
        clearForegroundPoll() {}, scheduleForegroundPoll() {}, clearRealtimeRetry() {},
        scheduleRealtimeRecovery() {}, noteRealtimeSubscribed() {}
      })
    };
    window.FinanceProfileArchitecture = {
      activeProfileId:() => "profile-personal",
      activeProfile:() => ({ name:"Personal", type:"personal", encryption:{ enabled:false } }),
      cloudProfileId:() => "",
      isCloudUnlocked:() => false,
      listCloudProfiles:async () => ({ profiles:[] }),
      configureEncryption:async () => {},
      createCloudProfile:async () => {}
    };
    window.financeLoadSupabase = async () => {
      window.__cloudTest.attempts += 1;
      if (window.__cloudTest.attempts === 1) throw new Error("Failed to fetch");
      return {
        createClient:() => ({
          auth:{
            onAuthStateChange(callback) {
              window.__cloudTest.listener = callback;
              callback("INITIAL_SESSION", null);
            },
            getSession:async () => {
              window.__cloudTest.sessionReads += 1;
              if (window.__cloudTest.sessionReads === 1) throw new Error("Network request failed");
              return { data:{ session:{ user:{ id:"user-1", email:"person@example.com" } } }, error:null };
            }
          }
        })
      };
    };
  });

  await page.addScriptTag({ path:"assets/js/cloud-sync.js" });
  await page.evaluate(() => {
    window.FINANCE_SYNC_CONFIG = {
      supabaseUrl:"https://example.supabase.co",
      supabasePublishableKey:"sb_publishable_abcdefghijklmnopqrstuvwxyz"
    };
  });
  await page.evaluate(() => window.FinanceCloudSyncInternals.restoreSession());

  const result = await page.evaluate(() => ({ ...window.__cloudTest, status:window.FinanceCloudSync.status }));
  expect(result.attempts).toBe(2);
  expect(result.sessionReads).toBe(2);
  expect(result.privacy).toEqual([false, true]);
  expect(result.status.signedIn).toBe(true);
  await page.evaluate(() => window.__cloudTest.listener("SIGNED_OUT", null));
  expect(await page.evaluate(() => window.__cloudTest.privacy)).toEqual([false, true, false]);
  expect(consoleNoise).toEqual([]);
});

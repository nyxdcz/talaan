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
    window.__cloudTest = { attempts:0, sessionReads:0, privacy:[], currentSession:null };
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
              callback("SIGNED_OUT", null);
            },
            getSession:async () => {
              window.__cloudTest.sessionReads += 1;
              if (window.__cloudTest.sessionReads === 1) throw new Error("Network request failed");
              if (window.__cloudTest.sessionReads === 2) window.__cloudTest.currentSession = { user:{ id:"user-1", email:"person@example.com" } };
              return { data:{ session:window.__cloudTest.currentSession }, error:null };
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
  expect(result.privacy).toEqual([false, true, true]);
  expect(result.status.signedIn).toBe(true);
  await page.evaluate(() => window.__cloudTest.listener("INITIAL_SESSION", null));
  expect(await page.evaluate(() => window.__cloudTest.privacy)).toEqual([false, true, true]);
  await page.evaluate(() => window.__cloudTest.listener("SIGNED_OUT", null));
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__cloudTest.privacy)).toEqual([false, true, true]);
  await page.evaluate(() => {
    window.__cloudTest.currentSession = null;
    window.__cloudTest.listener("SIGNED_OUT", null);
  });
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__cloudTest.privacy)).toEqual([false, true, true, false]);
  expect(consoleNoise).toEqual([]);
});


test("sign-in confirms the saved session before unlocking privacy", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(() => {
    window.data = {};
    window.FINANCE_SYNC_CONFIG = {};
    window.__cloudTest = { privacy:[], session:null, sessionReads:0 };
    window.FinancePrivacyLock = {
      setAuthenticated(value) { window.__cloudTest.privacy.push(Boolean(value)); }
    };
    window.FinanceCloudSyncLifecycle = {
      create:() => ({
        clearForegroundPoll() {}, scheduleForegroundPoll() {}, clearRealtimeRetry() {},
        scheduleRealtimeRecovery() {}, noteRealtimeSubscribed() {}
      })
    };
    window.financeLoadSupabase = async () => ({
      createClient:() => ({
        auth:{
          onAuthStateChange() {},
          signInWithPassword:async () => {
            const next = { access_token:"token", user:{ id:"user-1", email:"person@example.com" } };
            window.__cloudTest.session = next;
            return { data:{ session:next, user:next.user }, error:null };
          },
          getSession:async () => {
            window.__cloudTest.sessionReads += 1;
            return { data:{ session:window.__cloudTest.session }, error:null };
          }
        }
      })
    });
  });

  await page.addScriptTag({ path:"assets/js/cloud-sync.js" });
  await page.evaluate(() => {
    window.FINANCE_SYNC_CONFIG = {
      supabaseUrl:"https://example.supabase.co",
      supabasePublishableKey:"sb_publishable_abcdefghijklmnopqrstuvwxyz"
    };
  });
  const result = await page.evaluate(() => window.FinanceCloudSync.signIn("person@example.com", "password"));
  expect(result.user.id).toBe("user-1");
  expect(await page.evaluate(() => window.__cloudTest.sessionReads)).toBe(1);
  expect(await page.evaluate(() => window.__cloudTest.privacy.at(-1))).toBe(true);
});


test("real Supabase SDK restores its persisted session after reload without another login", async ({ page }) => {
  let logins = 0;
  const origin = "http://127.0.0.1:3000";
  await page.route(origin + "/auth-persistence-test", route => route.fulfill({
    contentType:"text/html", body:'<!doctype html><html><body><p data-privacy-auth-message></p></body></html>'
  }));
  const user = { id:"00000000-0000-0000-0000-000000000001", email:"test@example.com", aud:"authenticated", role:"authenticated" };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = encode({ alg:"HS256", typ:"JWT" }) + "." + encode({ sub:user.id, exp:expires, aud:"authenticated", role:"authenticated" }) + ".test-signature";
  await page.route("https://session-test.supabase.co/**", route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status:204, headers:{ "access-control-allow-origin":"*", "access-control-allow-headers":"*", "access-control-allow-methods":"*" } });
    if (route.request().url().includes("/auth/v1/token")) logins += 1;
    return route.fulfill({ contentType:"application/json", headers:{ "access-control-allow-origin":"*" }, body:JSON.stringify({
      access_token:token, refresh_token:"synthetic-refresh-token", expires_in:3600, expires_at:expires, token_type:"bearer", user
    }) });
  });
  await page.addInitScript(() => {
    window.data = {};
    window.FINANCE_SYNC_CONFIG = { supabaseUrl:"https://session-test.supabase.co", supabasePublishableKey:"sb_publishable_abcdefghijklmnopqrstuvwxyz" };
    window.FinancePrivacyLock = { setAuthenticated(value) { document.documentElement.dataset.testAuth = String(value); } };
    window.FinanceCloudSyncLifecycle = { create:() => ({
      clearForegroundPoll() {}, scheduleForegroundPoll() {}, clearRealtimeRetry() {},
      scheduleRealtimeRecovery() {}, noteRealtimeSubscribed() {}
    }) };
    window.FinanceProfileArchitecture = {
      activeProfileId:() => "profile-personal", cloudProfileId:() => "", isCloudUnlocked:() => false,
      listCloudProfiles:async () => ({ profiles:[{ profile_id:"locked-profile" }] }),
      connectCloudProfile:async () => { throw new Error("Incorrect passphrase"); }
    };
    window.financeLoadSupabase = () => import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.0/+esm");
  });
  await page.goto(origin + "/auth-persistence-test");
  await page.addScriptTag({ path:"assets/js/cloud-sync.js" });
  await expect.poll(() => page.evaluate(() => window.FinanceCloudSync.authDiagnostics.phase)).toBe("missing");
  await page.evaluate(() => window.FinanceCloudSync.signIn("test@example.com", "synthetic-password"));
  expect(logins).toBe(1);
  expect(await page.evaluate(() => Boolean(localStorage.getItem("sb-session-test-auth-token")))).toBe(true);
  await page.reload();
  await page.addScriptTag({ path:"assets/js/cloud-sync.js" });
  await expect.poll(() => page.evaluate(() => window.FinanceCloudSync.authDiagnostics.phase)).toBe("restored");
  expect(await page.evaluate(() => window.FinanceCloudSync.status.signedIn)).toBe(true);
  expect(logins).toBe(1);
  const diagnostic = await page.evaluate(() => window.FinanceCloudSync.authDiagnostics);
  expect(diagnostic.storage).toBe("present");
  expect(JSON.stringify(diagnostic)).not.toContain("synthetic");
  expect(JSON.stringify(diagnostic)).not.toContain(user.email);
});

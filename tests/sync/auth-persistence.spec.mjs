import { test, expect } from "@playwright/test";

const persistenceUrl = "https://talaan-auth-persistence-test.supabase.co";
const publishableKey = "sb_publishable_auth_persistence_test_key";
const storageKey = "talaan-auth-persistence-test";

function fakeSession() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg:"HS256", typ:"JWT" })}.${encode({ sub:"persistent-user", exp:4102444800 })}.c2lnbmF0dXJl`;
  return {
    access_token:accessToken,
    refresh_token:"refresh-token-for-persistence-test",
    expires_in:3600,
    expires_at:4102444800,
    token_type:"bearer",
    user:{
      id:"persistent-user",
      aud:"authenticated",
      role:"authenticated",
      email:"persistence@example.com",
      email_confirmed_at:"2026-01-01T00:00:00.000Z",
      created_at:"2026-01-01T00:00:00.000Z"
    }
  };
}

async function installSupabaseLoader(page) {
  await page.addScriptTag({ path:"vendor/supabase.min.js" });
  await page.waitForFunction(() => typeof window.financeLoadSupabase === "function");
}

test("real Supabase SDK restores its persisted session after a page reload", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/tests/fixtures/auth-persistence.html", { waitUntil:"domcontentloaded" });
  await page.route(`${persistenceUrl}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(fakeSession().user) });
      return;
    }
    await route.fulfill({ status:200, contentType:"application/json", body:"{}" });
  });
  await installSupabaseLoader(page);

  const first = await page.evaluate(async ({ url, key, session, storage }) => {
    const sdk = await window.financeLoadSupabase();
    const client = sdk.createClient(url, key, { auth:{ persistSession:true, autoRefreshToken:false, detectSessionInUrl:false, storageKey:storage } });
    const result = await client.auth.setSession(session);
    if (result.error) throw result.error;
    return { stored:Boolean(localStorage.getItem(storage)), email:result.data?.user?.email || "" };
  }, { url:persistenceUrl, key:publishableKey, session:fakeSession(), storage:storageKey });
  expect(first).toEqual({ stored:true, email:"persistence@example.com" });

  await page.reload({ waitUntil:"domcontentloaded" });
  await installSupabaseLoader(page);
  const restored = await page.evaluate(async ({ url, key, storage }) => {
    const sdk = await window.financeLoadSupabase();
    const client = sdk.createClient(url, key, { auth:{ persistSession:true, autoRefreshToken:false, detectSessionInUrl:false, storageKey:storage } });
    const result = await client.auth.getSession();
    return { error:result.error?.message || "", email:result.data?.session?.user?.email || "", accessTokenPresent:Boolean(result.data?.session?.access_token) };
  }, { url:persistenceUrl, key:publishableKey, storage:storageKey });
  expect(restored).toEqual({ error:"", email:"persistence@example.com", accessTokenPresent:true });
});

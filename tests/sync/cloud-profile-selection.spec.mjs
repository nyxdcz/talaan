import { test, expect } from "@playwright/test";

const profiles = [
  { profile_id:"cloud-profile-old-11111111", name:"My Finances", role:"owner", created_at:"2026-08-10T03:00:00Z", updated_at:"2026-08-12T03:00:00Z" },
  { profile_id:"cloud-profile-desktop-22222222", name:"My Finances", role:"owner", created_at:"2026-08-11T03:00:00Z", updated_at:"2026-08-17T09:00:00Z" }
];

const profileStats = {
  "cloud-profile-old-11111111":{ accounts:3, devices:1 },
  "cloud-profile-desktop-22222222":{ accounts:6, devices:2 }
};

async function loadLifecycle(page, { activeId = "", available = profiles } = {}) {
  await page.goto("http://127.0.0.1:3000/offline.html", { waitUntil:"networkidle" });
  await page.evaluate(({ activeId, available, profileStats }) => {
    const initDomAndGlobals = () => {
      document.body.innerHTML = `<main><section id="cloudSelectionHost"><article id="cloudFirstSyncCard" class="card"></article></section><section id="settings-panel-profiles"><article class="card profile-cloud-card"><div class="profile-actions"></div></article></section><article id="cloudSyncHealthCard" class="card"><div class="cloud-v3-health-grid"></div></article></main>`;
      sessionStorage.clear();
      localStorage.removeItem("simple-finance-cloud-profile-last-selected-v1");
      window.__profileCalls = { list:0, connect:[], create:0, rpc:[], persist:0 };
      window.__activeCloudProfileId = activeId;
      window.__availableProfiles = available.map(profile => ({ ...profile }));
      window.__profileStats = profileStats;
      window.data = { accounts:{ Wallet:330 }, accountTypes:{ Wallet:"Cash" }, accountOrder:["Wallet"], expenses:[] };
      window.showToast = () => {};
    };

    const initLocalStorage = () => {
      const localProfile = {
        id:"profile-personal",
        name:window.__availableProfiles.find(profile => profile.profile_id === activeId)?.name || "Local finance",
        type:"personal",
        role:"owner",
        cloudProfileId:activeId,
        createdAt:"2026-08-01T00:00:00Z",
        updatedAt:"2026-08-17T00:00:00Z"
      };
      localStorage.setItem("simple-finance-profiles-v1", JSON.stringify({ version:1, activeProfileId:"profile-personal", profiles:[localProfile] }));
      localStorage.setItem("simple-finance-profile-data-v1:profile-personal", JSON.stringify(window.data));
      localStorage.setItem("simple-finance-project-records-v2", JSON.stringify(window.data));
      localStorage.setItem("simple-finance-cloud-sync-v3:profile-personal", JSON.stringify({ status:"Synced" }));
      localStorage.setItem("simple-finance-cloud-record-base-v3:profile-personal", JSON.stringify({ sample:true }));
      localStorage.setItem("simple-finance-cloud-record-queue-v3:profile-personal", JSON.stringify({ sample:true }));
      localStorage.setItem("simple-finance-cloud-record-conflicts-v3:profile-personal", JSON.stringify([{ sample:true }]));
      return localProfile;
    };

    const createSupabaseQueryMock = () => {
      return table => {
        const state = { profileId:"", collection:"" };
        const api = {
          select:() => api,
          eq:(key, value) => { if (key === "profile_id") state.profileId = value; if (key === "collection") state.collection = value; return api; },
          is:() => api,
          then:(resolve, reject) => {
            try {
              const stats = window.__profileStats[state.profileId] || { accounts:0, devices:0 };
              const count = table === "finance_v3_devices" ? stats.devices : state.collection === "accounts" ? stats.accounts : 0;
              return Promise.resolve({ count, error:null }).then(resolve, reject);
            } catch (error) { return Promise.reject(error).then(resolve, reject); }
          }
        };
        return api;
      };
    };

    const createSupabaseRpcMock = () => {
      return async (name, args = {}) => {
        window.__profileCalls.rpc.push({ name, args:{ ...args } });
        const target = window.__availableProfiles.find(profile => profile.profile_id === args.p_profile_id);
        if (!target) return { data:null, error:{ message:"profile_not_found_or_owner" } };
        if (target.role !== "owner") return { data:null, error:{ message:"owner_required" } };
        if (name === "finance_v3_rename_profile") {
          const next = String(args.p_name || "").trim();
          if (!next || next.length > 80) return { data:null, error:{ message:"profile_name_required" } };
          target.name = next;
          target.updated_at = "2026-08-17T10:30:00Z";
          return { data:{ status:"renamed", profile_id:target.profile_id, name:target.name, updated_at:target.updated_at }, error:null };
        }
        if (name === "finance_v3_delete_profile") {
          if (String(args.p_confirm_name || "") !== target.name) return { data:null, error:{ message:"profile_name_confirmation_mismatch" } };
          window.__availableProfiles = window.__availableProfiles.filter(profile => profile.profile_id !== target.profile_id);
          return { data:{ status:"deleted", profile_id:target.profile_id, name:target.name }, error:null };
        }
        return { data:null, error:{ message:`unexpected_rpc:${name}` } };
      };
    };

    const initMockServices = localProfile => {
      window.FinanceCloudSyncInternals = {
        loadClient: async () => ({
          auth:{ getSession:async () => ({ data:{ session:{ user:{ id:"user-123", email:"Me@Example.com" } } } }) },
          from:createSupabaseQueryMock(),
          rpc:createSupabaseRpcMock()
        })
      };
      window.FinanceProfileArchitecture = {
        activeProfileId:() => "profile-personal",
        cloudProfileId:() => window.__activeCloudProfileId,
        activeProfile:() => {
          const remote = window.__availableProfiles.find(profile => profile.profile_id === window.__activeCloudProfileId);
          return { ...localProfile, name:remote?.name || localProfile.name, role:remote?.role || localProfile.role, cloudProfileId:window.__activeCloudProfileId };
        },
        persistCurrentData:source => {
          window.__profileCalls.persist += 1;
          localStorage.setItem("simple-finance-profile-data-v1:profile-personal", JSON.stringify(source));
          return true;
        },
        listCloudProfiles:async () => {
          window.__profileCalls.list += 1;
          return { profiles:window.__availableProfiles };
        },
        connectCloudProfile:async (...args) => {
          window.__profileCalls.connect.push(args);
          window.__activeCloudProfileId = args[0];
          return { cloudProfileId:args[0] };
        },
        createCloudProfile:async () => {
          window.__profileCalls.create += 1;
          return { profile_id:"new-cloud-profile" };
        }
      };
    };

    initDomAndGlobals();
    const localProfile = initLocalStorage();
    initMockServices(localProfile);
  }, { activeId, available, profileStats });
  await page.addScriptTag({ url:"http://127.0.0.1:3000/cloud-sync-lifecycle.js?v=profile-selection-test" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.FinanceCloudProfileSelection)), { timeout:10000 }).toBe(true);
}

test("duplicate cloud profiles require deliberate selection and show identity clues", async ({ page }) => {
  await loadLifecycle(page);

  const result = await page.evaluate(() => window.FinanceProfileArchitecture.listCloudProfiles());
  expect(result.profiles).toHaveLength(0);
  await expect(page.locator("#cloudProfileSelectionCard")).toBeVisible();
  await expect(page.locator('input[name="cloudProfileSelection"]')).toHaveCount(2);
  await expect(page.locator('input[name="cloudProfileSelection"]:checked')).toHaveCount(0);
  await expect(page.locator("#cloudProfileSelectionConfirm")).toBeDisabled();
  await expect(page.locator("[data-cloud-profile-duplicate-warning]")).toContainText("2 profiles share a duplicate name");
  await expect(page.locator("#cloudProfileSelectionMessage")).toContainText("No profile is preselected");

  const newest = page.locator('[data-cloud-profile-id="cloud-profile-desktop-22222222"]');
  await expect(newest).toContainText("Most recently updated");
  await expect(newest).toContainText("Duplicate name");
  await expect(newest).toContainText("Updated");
  await expect(newest).toContainText("Created");
  await expect.poll(async () => newest.locator("[data-cloud-profile-stats]").textContent()).toContain("Accounts 6 · Devices 2");
  await expect(newest.locator('[data-cloud-profile-rename="cloud-profile-desktop-22222222"]')).toBeVisible();
  await expect(newest.locator('[data-cloud-profile-delete="cloud-profile-desktop-22222222"]')).toBeVisible();

  const createError = await page.evaluate(async () => {
    try { await window.FinanceProfileArchitecture.createCloudProfile({}); return ""; }
    catch (error) { return String(error.message || error); }
  });
  expect(createError).toContain("Choose which existing Cloud Profile");
  expect(await page.evaluate(() => window.__profileCalls.connect.length)).toBe(0);
  expect(await page.evaluate(() => window.__profileCalls.create)).toBe(0);
});

test("a single accessible cloud profile keeps auto-connect compatibility but blocks accidental duplicate creation", async ({ page }) => {
  await loadLifecycle(page, { available:[profiles[1]] });
  const result = await page.evaluate(() => window.FinanceProfileArchitecture.listCloudProfiles());
  expect(result.profiles).toHaveLength(1);
  expect(result.profiles[0].profile_id).toBe(profiles[1].profile_id);
  await expect(page.locator("#cloudProfileSelectionCard")).toHaveCount(0);

  const createError = await page.evaluate(async () => {
    try { await window.FinanceProfileArchitecture.createCloudProfile({}); return ""; }
    catch (error) { return String(error.message || error); }
  });
  expect(createError).toContain("existing Cloud Profile is already available");
  expect(await page.evaluate(() => window.__profileCalls.create)).toBe(0);
});

test("confirmed profile selection connects the exact chosen profile using the account-derived key when appropriate", async ({ page }) => {
  await loadLifecycle(page);
  await page.evaluate(() => window.FinanceProfileArchitecture.listCloudProfiles());
  await page.locator(`input[value="${profiles[1].profile_id}"]`).check();
  await expect(page.locator("#cloudProfileSelectionConfirm")).toBeEnabled();
  await page.locator("#cloudProfileSelectionConfirm").click();

  await expect.poll(async () => page.evaluate(() => window.__profileCalls.connect.length), { timeout:10000 }).toBe(1);
  const call = await page.evaluate(() => window.__profileCalls.connect[0]);
  expect(call[0]).toBe(profiles[1].profile_id);
  expect(call[1]).toBe("user-123:my-finance-v13:me@example.com");
  expect(call[2]).toBe(true);
  expect(call[3]).toMatchObject({ auto:false, selectedByUser:true });
  expect(await page.evaluate(() => localStorage.getItem("simple-finance-cloud-profile-last-selected-v1"))).toBe(profiles[1].profile_id);
});

test("connected devices show the active Cloud Profile identity and expose switch, rename, and delete controls for owners", async ({ page }) => {
  await loadLifecycle(page, { activeId:profiles[1].profile_id });
  await expect.poll(async () => page.locator("#cloudHealthProfile").textContent(), { timeout:10000 }).toContain("My Finances");
  await expect(page.locator("#cloudHealthProfile")).toContainText("22222222");
  await expect(page.locator("#cloudProfileIdentityCard [data-cloud-profile-switch]")).toBeVisible();
  await expect(page.locator("#cloudProfileIdentityCard [data-cloud-profile-rename]")).toBeVisible();
  await expect(page.locator("#cloudProfileIdentityCard [data-cloud-profile-delete]")).toBeVisible();
  await expect(page.locator("#settings-panel-profiles [data-cloud-profile-switch]")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("simple-finance-cloud-profile-last-selected-v1"))).toBe(profiles[1].profile_id);
});

test("switching profiles preselects only the currently connected dataset", async ({ page }) => {
  await loadLifecycle(page, { activeId:profiles[0].profile_id });
  await page.evaluate(() => window.FinanceCloudProfileSelection.open());
  await expect(page.locator(`input[value="${profiles[0].profile_id}"]`)).toBeChecked();
  await expect(page.locator(`input[value="${profiles[1].profile_id}"]`)).not.toBeChecked();
  await expect(page.locator('[data-cloud-profile-id="cloud-profile-old-11111111"]')).toContainText("Current on this device");
});

test("owners can rename a Cloud Profile and the active identity updates without changing finance records", async ({ page }) => {
  await loadLifecycle(page, { activeId:profiles[1].profile_id });
  await page.evaluate(() => window.FinanceCloudProfileSelection.open());
  await page.locator(`[data-cloud-profile-rename="${profiles[1].profile_id}"]`).first().click();
  await expect(page.locator("#cloudProfileManagementDialog")).toBeVisible();
  await expect(page.locator("#cloudProfileManagementTitle")).toHaveText("Rename Cloud Profile");
  await page.locator("#cloudProfileRenameInput").fill("Primary Finance");
  await page.locator("#cloudProfileManagementSubmit").click();

  await expect.poll(async () => page.evaluate(() => window.__profileCalls.rpc.some(call => call.name === "finance_v3_rename_profile"))).toBe(true);
  await expect.poll(async () => page.locator("#cloudHealthProfile").textContent()).toContain("Primary Finance");
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("simple-finance-profiles-v1")));
  expect(meta.profiles[0].name).toBe("Primary Finance");
  expect(await page.evaluate(() => window.__profileCalls.persist)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("simple-finance-profile-data-v1:profile-personal")).accounts.Wallet)).toBe(330);
});

test("Editor and Viewer Cloud Profiles do not expose rename or delete actions", async ({ page }) => {
  const mixed = [
    { ...profiles[0], role:"editor", name:"Shared editor" },
    { ...profiles[1], role:"viewer", name:"Shared viewer" }
  ];
  await loadLifecycle(page, { available:mixed });
  await page.evaluate(() => window.FinanceProfileArchitecture.listCloudProfiles());
  await expect(page.locator('[data-cloud-profile-id="cloud-profile-old-11111111"] [data-cloud-profile-actions]')).toHaveCount(0);
  await expect(page.locator('[data-cloud-profile-id="cloud-profile-desktop-22222222"] [data-cloud-profile-actions]')).toHaveCount(0);
});

test("Cloud Profile delete requires exact typed confirmation and preserves local data before detaching the active cloud profile", async ({ page }) => {
  await loadLifecycle(page, { activeId:profiles[0].profile_id });
  await page.evaluate(() => {
    window.addEventListener("finance:cloud-profile-deleted", () => {
      sessionStorage.setItem("test-profile-meta-after-delete", localStorage.getItem("simple-finance-profiles-v1") || "");
      sessionStorage.setItem("test-profile-data-after-delete", localStorage.getItem("simple-finance-profile-data-v1:profile-personal") || "");
      sessionStorage.setItem("test-sync-meta-after-delete", localStorage.getItem("simple-finance-cloud-sync-v3:profile-personal") || "");
      sessionStorage.setItem("test-persist-count-after-delete", String(window.__profileCalls.persist));
      sessionStorage.setItem("test-recovery-count-after-delete", String(Object.keys(localStorage).filter(key => key.startsWith("simple-finance-cloud-recovery-")).length));
    }, { once:true });
  });
  await page.evaluate(() => window.FinanceCloudProfileSelection.open());
  await page.locator(`[data-cloud-profile-delete="${profiles[0].profile_id}"]`).first().click();
  await expect(page.locator("#cloudProfileManagementTitle")).toHaveText("Delete Cloud Profile");
  await expect(page.locator("#cloudProfileManagementSubmit")).toBeDisabled();
  await page.locator("#cloudProfileDeleteConfirm").fill("Wrong name");
  await expect(page.locator("#cloudProfileManagementSubmit")).toBeDisabled();
  await page.locator("#cloudProfileDeleteConfirm").fill("My Finances");
  await expect(page.locator("#cloudProfileManagementSubmit")).toBeEnabled();
  await page.locator("#cloudProfileManagementSubmit").click();

  await expect.poll(async () => page.evaluate(() => sessionStorage.getItem("test-profile-meta-after-delete")), { timeout:10000 }).not.toBeNull();
  const meta = JSON.parse(await page.evaluate(() => sessionStorage.getItem("test-profile-meta-after-delete")));
  const saved = JSON.parse(await page.evaluate(() => sessionStorage.getItem("test-profile-data-after-delete")));
  expect(meta.profiles[0].cloudProfileId).toBe("");
  expect(saved.accounts.Wallet).toBe(330);
  expect(await page.evaluate(() => sessionStorage.getItem("test-sync-meta-after-delete"))).toBe("");
  expect(Number(await page.evaluate(() => sessionStorage.getItem("test-persist-count-after-delete")))).toBeGreaterThan(0);
  expect(Number(await page.evaluate(() => sessionStorage.getItem("test-recovery-count-after-delete")))).toBeGreaterThan(0);
});

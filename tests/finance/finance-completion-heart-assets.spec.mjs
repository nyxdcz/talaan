import { createHash } from "node:crypto";
import { test, expect } from "../helpers/browser-fixtures.mjs";

const EXPECTED = {
  light:"98999e5da1549a7ffdf0bb170400b91b01c806868fc259cff80c90fa6b5cc79e",
  dark:"f0220d0b819f34370a5a3179a09bc1ba0ad813bd60161909a1357db0c50e972b"
};

async function assetSha256(request, path) {
  const response = await request.get(`http://127.0.0.1:3000${path}`, { headers:{ "cache-control":"no-cache" } });
  expect(response.ok()).toBeTruthy();
  return createHash("sha256").update(await response.body()).digest("hex");
}

test("Finance completion hearts use the canonical exact clean uploaded PNGs without the line", async ({ request }) => {
  expect(await assetSha256(request, "/icons/heart-smile-light-r4.png")).toBe(EXPECTED.light);
  expect(await assetSha256(request, "/icons/heart-smile-dark-r4.png")).toBe(EXPECTED.dark);

  const cssResponse = await request.get("http://127.0.0.1:3000/ui-icon-alignment.css", { headers:{ "cache-control":"no-cache" } });
  expect(cssResponse.ok()).toBeTruthy();
  const css = await cssResponse.text();
  expect(css).toContain('heart-smile-light-r4.png');
  expect(css).toContain('heart-smile-dark-r4.png');
  expect(css).not.toMatch(/heart-smile-(?:light|dark)-v15-2-4-r[23]\.png/);
});

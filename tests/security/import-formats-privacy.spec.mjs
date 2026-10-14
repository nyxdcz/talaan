import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "../helpers/browser-fixtures.mjs";

test("OFX and QIF files remain session-only and reject unsafe document structures", () => {
  const formats = fs.readFileSync("assets/js/import-formats.js", "utf8");
  const center = fs.readFileSync("assets/js/import-center.js", "utf8");
  const combined = `${formats}\n${center}`;

  assert.doesNotMatch(combined, /\bfetch\s*\(/);
  assert.doesNotMatch(combined, /XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(combined, /caches\.(?:open|put|add)/);
  assert.doesNotMatch(combined, /localStorage\.setItem\([^)]*(?:file|ofx|qif)/i);
  assert.match(formats, /<!DOCTYPE\|<!ENTITY/);
  assert.match(formats, /const MAX_ROWS = 20000/);
  assert.match(center, /const MAX_FILE_SIZE = 10 \* 1024 \* 1024/);
  assert.match(center, /\\\.\(csv\|ofx\|qif\)\$/);
  assert.match(center, /const text = await file\.text\(\)/);
  assert.match(center, /The uploaded file is not stored, synchronized, or cached/);

  const batchStart = center.indexOf("function buildBatch");
  const batchEnd = center.indexOf("async function commitImport", batchStart);
  const batchSource = center.slice(batchStart, batchEnd);
  assert.ok(batchStart >= 0 && batchEnd > batchStart);
  assert.doesNotMatch(batchSource, /fileName|rawRows|fileContents|fileHash/);
});

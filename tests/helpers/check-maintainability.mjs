import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const failures = [];
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const lines = file => read(file).split(/\r?\n/).length;
const fail = message => failures.push(message);

const indexLines = lines("index.html");
if (indexLines > 9500) fail(`index.html grew to ${indexLines} lines; extract a cohesive module before adding more inline code`);
const appCssLines = lines("assets/css/app.css");
if (appCssLines > 5500) fail(`assets/css/app.css grew to ${appCssLines} lines; split it by feature before adding more styles`);

const firstPartyModules = [
  ...fs.readdirSync(path.join(root, "assets/js")).filter(name => name.endsWith(".js")).map(name => `assets/js/${name}`),
  ...fs.readdirSync(root).filter(name => name.endsWith(".js") && !["index.html"].includes(name))
];
for (const file of firstPartyModules) {
  const count = lines(file);
  if (count > 1800) fail(`${file} grew to ${count} lines; split it into a focused module`);
}

const pkg = JSON.parse(read("package.json"));
for (const script of ["lint", "inspect", "test", "test:browser", "maintainability", "quality", "quality:ci"]) {
  if (!pkg.scripts?.[script] || /echo ['"]No .*required/i.test(pkg.scripts[script])) fail(`package script ${script} is missing or a no-op`);
}

const testFiles = [];
const visitTests = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) visitTests(full);
    else if (entry.isFile() && /\.(?:mjs|py)$/.test(entry.name)) testFiles.push(full);
  }
};
visitTests(path.join(root, "tests"));
for (const full of testFiles) {
  const file = path.relative(root, full).replaceAll(path.sep, "/");
  const source = fs.readFileSync(full, "utf8");
  if (file.endsWith(".spec.mjs") && /from\s+["']@playwright\/test["']/.test(source)) fail(`${file} bypasses browser-fixtures.mjs and its isolated startup defaults`);
  if (/\/mnt\/data\//.test(source)) fail(`${file} contains a non-portable /mnt/data path`);
  if (/executable_path\s*=\s*['"]\/usr\/bin\/chromium/.test(source)) fail(`${file} hardcodes a Chromium executable`);
}

if (failures.length) {
  console.error(`Maintainability checks failed:\n${failures.map(item => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`Maintainability checks passed: index.html ${indexLines}/9500 lines; assets/css/app.css ${appCssLines}/5500 lines; first-party modules <=1800 lines; validation scripts are active and portable.`);

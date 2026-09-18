let rawTitle = String(process.env.PR_TITLE || "").trim();
// Strip leading emojis and whitespace if present
let title = rawTitle.replace(/^[\p{Extended_Pictographic}\s\u2600-\u27BF]+/u, "").trim();
const allowed = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._-]+\))?!?:\s+\S.+$/;

if (!allowed.test(title)) {
  console.error("Pull-request title must use Conventional Commit format, for example: fix: restore installer permissions");
  process.exit(1);
}

console.log(`Pull-request title is valid: ${title}`);

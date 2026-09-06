#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

node "$SCRIPT_DIR/prepare-runtime.mjs"

echo "=== Broken References ==="
for f in index.html offline.html; do
  if [ -f "$f" ]; then
    echo "Files referenced in $f:"
    grep -oE "src=\"[^\"]+\"|href=\"[^\"]+\"" "$f" | awk -F'"' '{print $2}' | grep -v "^http" | grep -v "^#" | while read src; do
      src=${src%%\?*}
      if [ ! -f "$src" ]; then
        echo "MISSING: $src in $f"
      fi
    done
  fi
done

echo "=== Dead CSS files ==="
for f in *.css; do
  if ! grep -q "$f" index.html offline.html *.js; then
    echo "UNUSED: $f"
  fi
done

echo "=== Dead JS files ==="
for f in *.js; do
  if ! grep -q "$f" index.html offline.html sw.js package.json; then
    echo "UNUSED: $f"
  fi
done

echo "=== Hardcoded Secrets ==="
grep -rnE "(supabase|SUPABASE|Supabase).*(key|KEY).*(ey[A-Za-z0-9_-]+)" . || echo "None found"
grep -rnE "(password|secret|token)[=:\s]+['\"][a-zA-Z0-9]{10,}['\"]" . | grep -vE "(validation|test)" | head -n 5 || echo "None found"

echo "=== Common Mistakes ==="
grep -rn "TODO" . || echo "No TODOs"
grep -rn "FIXME" . || echo "No FIXMEs"
grep -rn "debugger" . || echo "No debugger"
grep -rn "alert(" . | grep -vE "(validation|test)" || echo "No alerts"

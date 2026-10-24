/* The web app's layers import downwards only (docs/ARCHITECTURE.md):
   ui/ and media/ and state/ know nothing of app/, input/ or net/; input/
   and net/ know nothing of app/. Fails the build when a line crosses up. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const root = resolve("apps/web/src");
const rank = { ui: 0, media: 0, state: 0, input: 1, net: 1, app: 2, "": 3 }; // "" is main.ts
const layerOf = (p) => { const first = relative(root, p).split("/")[0]; return first.endsWith(".ts") ? "" : first; };
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } })(root);
const bad = [];
for (const f of files) {
  const from = layerOf(f);
  for (const m of readFileSync(f, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)) {
    const target = resolve(dirname(f), m[1] + ".ts");
    const to = layerOf(target);
    if (rank[to] === undefined || rank[from] === undefined) continue;
    if (rank[to] > rank[from]) bad.push(`${relative(root, f)} imports ${relative(root, target)} (${from || "main"} → ${to})`);
  }
}
if (bad.length) { console.error("layer violations:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`layers ok: ${files.length} files`);

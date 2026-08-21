/**
 * Inserts new translation keys into every dictionary in src/lib/i18n.tsx.
 *
 * Usage: node scripts/i18n-add.mjs path/to/keys.json
 * Shape: { "key": { "en": "...", "bg": "...", "de": "...", "fr": "...", "es": "..." } }
 *
 * Existing keys are left untouched, so the script is safe to re-run.
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = "src/lib/i18n.tsx";
const payload = JSON.parse(readFileSync(process.argv[2], "utf8"));
let src = readFileSync(file, "utf8");
const langs = ["en", "bg", "de", "fr", "es"];

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

for (const lang of langs) {
  const start = src.indexOf(`const ${lang}: Dict = {`);
  if (start === -1) throw new Error(`dictionary ${lang} not found`);
  const end = src.indexOf("\n};", start);
  const body = src.slice(start, end);
  const lines = [];
  for (const [key, vals] of Object.entries(payload)) {
    if (body.includes(`"${key}":`)) continue;
    const value = vals[lang] ?? vals.en;
    lines.push(`  "${esc(key)}": "${esc(value)}",`);
  }
  if (!lines.length) continue;
  src = src.slice(0, end) + "\n" + lines.join("\n") + src.slice(end);
}

writeFileSync(file, src);
console.log(`added ${Object.keys(payload).length} key(s) across ${langs.length} locales`);

#!/usr/bin/env node
/**
 * i18n locale coverage check.
 *
 * 1. Parses src/lib/i18n.tsx and extracts the key set of every locale dict
 *    (`const en: Dict = {...}`, `const bg: Dict = {...}`, ...).
 * 2. Scans src/routes and src/components for translation calls with a static
 *    key — t("x"), tr("x"), tCat("x"), translate("x") — plus keys passed to
 *    fmt(t("x"), ...).
 * 3. Fails when a used key is missing from English or from ANY non-English
 *    locale, so the build breaks before untranslated UI ships.
 *
 * Escape hatch: add a key (or regex) to scripts/i18n-locale-allowlist.txt.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DICT_FILE = join(ROOT, "src/lib/i18n.tsx");
const SCAN_DIRS = ["src/routes", "src/components", "src/lib"];
const PATH_SKIP = ["routeTree.gen.ts", "src/components/ui/"];
const T_FNS = /^(t|tr|tCat|tRaw|translate)$/;

function loadAllowlist() {
  const p = join(ROOT, "scripts/i18n-locale-allowlist.txt");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}
const ALLOW = loadAllowlist();
const isAllowed = (key) => ALLOW.some((rule) => {
  try { return new RegExp(`^${rule}$`).test(key); } catch { return key === rule; }
});

function parseFile(file) {
  return parse(readFileSync(file, "utf8"), {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    errorRecovery: true,
  });
}

function walkAst(node, fn) {
  if (!node || typeof node !== "object") return;
  if (node.type) fn(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walkAst(c, fn));
    else if (v && typeof v === "object" && v.type) walkAst(v, fn);
  }
}

// ---- 1. locale dictionaries -------------------------------------------------
const locales = new Map(); // name -> Set(keys)
walkAst(parseFile(DICT_FILE), (n) => {
  if (n.type !== "VariableDeclarator") return;
  if (n.id?.type !== "Identifier") return;
  const ann = n.id.typeAnnotation?.typeAnnotation;
  const isDict = ann?.type === "TSTypeReference" && ann.typeName?.name === "Dict";
  if (!isDict || n.init?.type !== "ObjectExpression") return;
  const keys = new Set();
  for (const p of n.init.properties) {
    if (p.type !== "ObjectProperty") continue;
    const k = p.key.type === "StringLiteral" ? p.key.value
      : p.key.type === "Identifier" ? p.key.name : null;
    if (k) keys.add(k);
  }
  locales.set(n.id.name, keys);
});

if (!locales.has("en")) {
  console.error("i18n locale check FAILED — could not find the `en` dictionary in src/lib/i18n.tsx");
  process.exit(1);
}
const en = locales.get("en");
const others = [...locales.entries()].filter(([name]) => name !== "en");

// ---- 2. used keys -----------------------------------------------------------
function walkDir(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (PATH_SKIP.some((p) => full.includes(p))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walkDir(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

const used = new Map(); // key -> [{file, line}]
const files = SCAN_DIRS.flatMap((d) => {
  const full = join(ROOT, d);
  return existsSync(full) ? walkDir(full) : [];
}).filter((f) => f !== DICT_FILE);

for (const file of files) {
  walkAst(parseFile(file), (n) => {
    if (n.type !== "CallExpression") return;
    const c = n.callee;
    const name = c.type === "Identifier" ? c.name
      : c.type === "MemberExpression" && c.property.type === "Identifier" ? c.property.name
      : null;
    if (!name || !T_FNS.test(name)) return;
    const arg = n.arguments[0];
    if (arg?.type !== "StringLiteral") return;
    const key = arg.value;
    if (!key.includes(".") && !en.has(key)) return; // ignore non-key string args
    if (!used.has(key)) used.set(key, []);
    used.get(key).push({ file, line: n.loc?.start.line ?? 0 });
  });
}

// ---- 3. report --------------------------------------------------------------
const missingEn = [];
const missingLocale = new Map(); // locale -> [keys]

for (const key of [...used.keys()].sort()) {
  if (isAllowed(key)) continue;
  if (!en.has(key)) { missingEn.push(key); continue; }
  for (const [name, keys] of others) {
    if (!keys.has(key)) {
      if (!missingLocale.has(name)) missingLocale.set(name, []);
      missingLocale.get(name).push(key);
    }
  }
}

const total = missingEn.length + [...missingLocale.values()].reduce((a, b) => a + b.length, 0);

if (total) {
  console.error(`\ni18n locale check FAILED — ${total} missing translation(s):\n`);
  if (missingEn.length) {
    console.error("Missing from `en` (key used but never defined):");
    for (const k of missingEn) {
      const { file, line } = used.get(k)[0];
      console.error(`  ${k}  (${relative(ROOT, file)}:${line})`);
    }
    console.error("");
  }
  for (const [name, keys] of missingLocale) {
    console.error(`Missing from \`${name}\` (${keys.length}):`);
    for (const k of keys) console.error(`  ${k}`);
    console.error("");
  }
  console.error(
    "Fix: add the key with a translated value to every locale dict in\n" +
    "     src/lib/i18n.tsx, or allowlist it in scripts/i18n-locale-allowlist.txt.\n"
  );
  process.exit(1);
}

console.log(
  `i18n locale check passed — ${used.size} key(s) used across ${files.length} file(s), ` +
  `complete in ${locales.size} locale(s): ${[...locales.keys()].join(", ")}.`
);

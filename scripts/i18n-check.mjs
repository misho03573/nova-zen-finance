#!/usr/bin/env node
/**
 * i18n regression check.
 *
 * Scans src/routes/**\/*.tsx and src/components/nova/**\/*.tsx for
 * user-facing strings that are not routed through the i18n system.
 *
 * Flags:
 *   - JSXText nodes containing alphabetic characters that are not wrapped
 *     in a `{t(...)}` / `{tCat(...)}` / equivalent call.
 *   - String literal values on user-visible JSX attributes
 *     (placeholder, title, aria-label, alt) that are not `{t(...)}` calls.
 *
 * Escape hatches:
 *   - Add `// i18n-ignore` on the same line or the line above the offending
 *     JSX to acknowledge an intentional literal (brand names, symbols, etc.).
 *   - Add a substring / regex to scripts/i18n-allowlist.txt (one per line,
 *     `#` comments allowed). Matching strings are ignored globally.
 *
 * Exits 1 when violations are found so it can gate CI.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  "src/routes",
  "src/components/nova",
];
const ATTR_ALLOWLIST = new Set([
  "placeholder",
  "title",
  "aria-label",
  "aria-description",
  "alt",
  "label",
]);

// Attribute names whose string values are structural / non-user-facing.
const ATTR_IGNORE = new Set([
  "className", "class", "id", "key", "name", "type", "role", "href", "to",
  "src", "value", "defaultValue", "style", "target", "rel", "form",
  "autoComplete", "autoCapitalize", "inputMode", "pattern", "step",
  "min", "max", "size", "width", "height", "color", "fill", "stroke",
  "viewBox", "d", "points", "transform", "data-testid", "data-state",
  "variant", "side", "align", "orientation", "layoutId", "activeProps",
  "inactiveProps", "params", "search",
]);

// Files or path fragments to skip entirely.
const PATH_SKIP = [
  "src/components/ui/",
  "routeTree.gen.ts",
];

function loadAllowlist() {
  const p = join(ROOT, "scripts/i18n-allowlist.txt");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}
const ALLOW = loadAllowlist();

function isAllowlisted(str) {
  const s = str.trim();
  if (!s) return true;
  // No alphabetic letters -> not translatable prose (icons, numbers, symbols).
  if (!/\p{L}/u.test(s)) return true;
  // Single character words like "×" or "A" — treat as UI glyph.
  if (s.length <= 1) return true;
  for (const rule of ALLOW) {
    try {
      if (new RegExp(rule).test(s)) return true;
    } catch {
      if (s.includes(rule)) return true;
    }
  }
  return false;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (PATH_SKIP.some((p) => full.includes(p))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

function hasIgnoreComment(source, line) {
  const lines = source.split("\n");
  const same = lines[line - 1] || "";
  const prev = lines[line - 2] || "";
  return /i18n-ignore/.test(same) || /i18n-ignore/.test(prev);
}

/** Detects a translation call anywhere in a JSXExpressionContainer expression. */
function containsTranslationCall(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "CallExpression") {
    const c = node.callee;
    if (c.type === "Identifier" && /^(t|tCat|tRaw|fmt|translate|useT)$/.test(c.name)) return true;
    if (c.type === "MemberExpression" && c.property.type === "Identifier"
        && /^(t|tCat|translate)$/.test(c.property.name)) return true;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (containsTranslationCall(c)) return true;
    } else if (v && typeof v === "object" && v.type) {
      if (containsTranslationCall(v)) return true;
    }
  }
  return false;
}

const violations = [];

function checkFile(file) {
  const src = readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(src, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch (e) {
    violations.push({ file, line: 0, kind: "parse", text: e.message });
    return;
  }

  const visit = (node, parent) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "JSXText") {
      const raw = node.value;
      if (!isAllowlisted(raw)) {
        const line = node.loc?.start.line ?? 0;
        if (!hasIgnoreComment(src, line)) {
          violations.push({
            file, line, kind: "jsx-text",
            text: raw.trim().slice(0, 80),
          });
        }
      }
    }

    if (node.type === "JSXAttribute" && node.name?.type === "JSXIdentifier") {
      const attr = node.name.name;
      const shouldCheck = ATTR_ALLOWLIST.has(attr);
      const shouldIgnore = ATTR_IGNORE.has(attr) || attr.startsWith("data-") || attr.startsWith("on");
      if (shouldCheck && !shouldIgnore && node.value) {
        let literal = null;
        if (node.value.type === "StringLiteral") literal = node.value.value;
        else if (
          node.value.type === "JSXExpressionContainer" &&
          node.value.expression.type === "StringLiteral"
        ) literal = node.value.expression.value;
        else if (
          node.value.type === "JSXExpressionContainer" &&
          !containsTranslationCall(node.value.expression) &&
          node.value.expression.type === "TemplateLiteral" &&
          node.value.expression.expressions.length === 0
        ) literal = node.value.expression.quasis[0].value.cooked;

        if (literal !== null && !isAllowlisted(literal)) {
          const line = node.loc?.start.line ?? 0;
          if (!hasIgnoreComment(src, line)) {
            violations.push({
              file, line, kind: `attr:${attr}`,
              text: literal.slice(0, 80),
            });
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => visit(c, node));
      else if (v && typeof v === "object" && v.type) visit(v, node);
    }
  };
  visit(ast, null);
}

const files = SCAN_DIRS.flatMap((d) => {
  const full = join(ROOT, d);
  return existsSync(full) ? walk(full) : [];
});

files.forEach(checkFile);

if (violations.length) {
  console.error(`\ni18n check FAILED — ${violations.length} hardcoded string(s):\n`);
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of byFile) {
    console.error(relative(ROOT, file));
    for (const v of list) {
      console.error(`  ${v.line.toString().padStart(4)}  [${v.kind}]  ${JSON.stringify(v.text)}`);
    }
    console.error("");
  }
  console.error(
    "Fix: wrap the string with t('key') from '@/lib/i18n', or acknowledge with\n" +
    "     // i18n-ignore  (comment on same or previous line), or add a rule to\n" +
    "     scripts/i18n-allowlist.txt.\n"
  );
  process.exit(1);
}
console.log(`i18n check passed — ${files.length} file(s) scanned, no untranslated strings.`);
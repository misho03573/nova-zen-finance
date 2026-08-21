#!/usr/bin/env node
/**
 * Builds the static web bundle that Capacitor packages into the iOS/Android
 * WebView.
 *
 * The normal `bun run build` produces an SSR/Cloudflare bundle with no
 * index.html — a native WebView cannot serve that. With NOVA_NATIVE=1 the Vite
 * config disables the server output and asks TanStack Start for an SPA shell
 * (`dist/client/_shell.html`). This script runs that build and assembles
 * `dist/native/` with the shell renamed to `index.html`, which is what
 * `capacitor.config.ts` points `webDir` at.
 *
 * The web build is untouched: it still runs through `bun run build`.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const client = resolve(root, "dist/client");
const out = resolve(root, "dist/native");

execSync("vite build", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NOVA_NATIVE: "1" },
});

const shell = resolve(client, "_shell.html");
if (!existsSync(shell)) {
  console.error("[build:native] Missing dist/client/_shell.html — SPA shell was not generated.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(client, out, { recursive: true });
renameSync(resolve(out, "_shell.html"), resolve(out, "index.html"));
rmSync(resolve(out, "_headers"), { force: true });

console.log("[build:native] Static native bundle ready at dist/native (index.html + assets).");

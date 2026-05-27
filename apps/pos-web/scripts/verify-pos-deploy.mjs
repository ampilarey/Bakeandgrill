#!/usr/bin/env node
/**
 * Ensures backend/public/pos/pos-version.json matches the embedded build
 * inside the shipped JS bundle. Prevents "Update Now" loops when only the
 * manifest was regenerated without a full Vite build + dist copy.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const posDir = path.join(repoRoot, "backend/public/pos");
const versionPath = path.join(posDir, "pos-version.json");
const indexPath = path.join(posDir, "index.html");

function fail(message) {
  console.error(`POS deploy verify FAILED: ${message}`);
  process.exit(1);
}

if (!existsSync(versionPath)) fail(`missing ${versionPath}`);
if (!existsSync(indexPath)) fail(`missing ${indexPath}`);

const version = JSON.parse(readFileSync(versionPath, "utf8"));
const indexHtml = readFileSync(indexPath, "utf8");
const scriptMatch = indexHtml.match(/src="\/pos\/assets\/([^"]+\.js)"/);
if (!scriptMatch) fail("index.html has no /pos/assets/*.js script tag");

const bundlePath = path.join(posDir, "assets", scriptMatch[1]);
if (!existsSync(bundlePath)) fail(`bundle missing: assets/${scriptMatch[1]}`);

const bundle = readFileSync(bundlePath, "utf8");
const { build, commit } = version;

if (!build || !commit) fail("pos-version.json missing build or commit");
if (!bundle.includes(build)) {
  fail(
    `pos-version.json build "${build}" not found in ${scriptMatch[1]}. ` +
      "Run: ./scripts/build-all.sh pos",
  );
}
if (!bundle.includes(commit)) {
  fail(
    `pos-version.json commit "${commit}" not found in ${scriptMatch[1]}. ` +
      "Run: ./scripts/build-all.sh pos",
  );
}

console.log(`POS deploy OK: ${build} (${scriptMatch[1]})`);

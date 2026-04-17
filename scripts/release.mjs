#!/usr/bin/env node
/**
 * Full release pipeline for Meeting Helper.
 *
 * What it does (in order):
 *   1. Bumps patch version (via bump-version.mjs)
 *   2. Builds frontend + electron
 *   3. Packages installer via electron-builder (DMG on macOS, NSIS on Windows) — for local verification
 *   4. Updates landing page version badges + DOWNLOAD_URL/WINDOWS_URL to point at GitHub Release assets
 *   5. Commits everything and pushes (triggers Vercel auto-deploy)
 *
 * Installers are published via the GitHub Actions release workflow triggered on `v*` tags.
 * After this script finishes, tag and push: `git tag v<ver> && git push origin v<ver>`.
 *
 * Usage:
 *   pnpm release              # auto-detects platform
 *   pnpm release -- --mac     # force macOS build
 *   pnpm release -- --win     # force Windows build
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env }, ...opts });
}

// Determine platform
function detectPlatform() {
  const args = process.argv.slice(2);
  if (args.includes('--mac')) return 'mac';
  if (args.includes('--win')) return 'win';
  return process.platform === 'win32' ? 'win' : 'mac';
}

const platform = detectPlatform();

console.log(`=== Meeting Helper Release (${platform}) ===\n`);

// 1. Build + package (bump-version runs automatically via pnpm dist)
console.log(`Step 1/3: Building and packaging ${platform === 'mac' ? 'DMG' : 'NSIS installer'}...`);
run(platform === 'mac' ? "pnpm dist:mac" : "pnpm dist:win");

// Read the new version
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;
console.log(`\nVersion: ${version}`);

// Find the installer
const installerName = platform === 'mac'
  ? `Meeting Helper-${version}-arm64.dmg`
  : `Meeting Helper-${version}-win-x64.exe`;
const installerPath = resolve(root, "release", installerName);
try {
  readFileSync(installerPath);
} catch {
  console.error(`Installer not found at: ${installerPath}`);
  process.exit(1);
}

// 2. Update landing page version + download URLs (mac + win → GitHub Releases)
console.log("\nStep 2/3: Updating landing page version and download URLs...");
const pagePath = resolve(root, "landing/src/app/page.tsx");
let page = readFileSync(pagePath, "utf8");
// Update version badges in both EN and PT
page = page.replace(/hero_badge: "v[\d.]+ — FREE"/, `hero_badge: "v${version} — FREE"`);
page = page.replace(/hero_badge: "v[\d.]+ — GRATUITO"/, `hero_badge: "v${version} — GRATUITO"`);
// Update bottom version tag
page = page.replace(/v[\d.]+<\/span>/, `v${version}</span>`);
// Update DOWNLOAD_URL (mac) to GitHub release asset
page = page.replace(
  /const DOWNLOAD_URL = ".*";/,
  `const DOWNLOAD_URL = "https://github.com/allanhal/helper/releases/download/v${version}/Meeting.Helper-${version}-arm64.dmg";`
);
// Update WINDOWS_URL to GitHub release asset
page = page.replace(
  /const WINDOWS_URL = ".*";/,
  `const WINDOWS_URL = "https://github.com/allanhal/helper/releases/download/v${version}/Meeting.Helper-${version}-win-x64.exe";`
);
const { writeFileSync } = await import("fs");
writeFileSync(pagePath, page, "utf8");
console.log(`Updated landing page to v${version}`);

// 3. Commit and push
console.log("\nStep 3/3: Committing and pushing...");
run("git add package.json landing/src/app/page.tsx");
run(`git commit -m "Release Meeting Helper v${version} (${platform})"`);
run("git push");

console.log(`\n=== Released Meeting Helper v${version} (${platform}) ===`);
console.log("Vercel will auto-deploy the landing page to meetinghelper.vercel.app");

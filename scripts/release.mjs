#!/usr/bin/env node
/**
 * Full release pipeline for Meeting Helper.
 *
 * What it does (in order):
 *   1. Bumps patch version (via bump-version.mjs)
 *   2. Builds frontend + electron
 *   3. Packages DMG via electron-builder
 *   4. Uploads DMG to Vercel Blob (versioned filename)
 *   5. Updates landing page DOWNLOAD_URL with new blob URL
 *   6. Commits everything and pushes (triggers Vercel auto-deploy)
 *
 * Requirements:
 *   - BLOB_READ_WRITE_TOKEN env var (get it: cd landing && vercel env pull .env.local --environment production)
 *   - git clean working tree (uncommitted changes will be included in release commit)
 *
 * Usage:
 *   pnpm release
 *
 * The script auto-loads BLOB_READ_WRITE_TOKEN from landing/.env.local.
 * If missing, run: cd landing && vercel env pull .env.local --environment production
 */
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = resolve(__dirname, "..");

// Auto-load .env.local if token not in env
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  const envPath = resolve(root, "landing/.env.local");
  if (existsSync(envPath)) {
    const envFile = readFileSync(envPath, "utf8");
    for (const line of envFile.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env }, ...opts });
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("\nMissing BLOB_READ_WRITE_TOKEN. Run:");
  console.error("  cd landing && vercel env pull .env.local --environment production");
  process.exit(1);
}

console.log("=== Meeting Helper Release ===\n");

// 1. Build + package (bump-version runs automatically via pnpm dist)
console.log("Step 1/4: Building and packaging DMG...");
run("pnpm dist");

// Read the new version
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;
console.log(`\nVersion: ${version}`);

// Find the DMG
const dmgName = `Meeting Helper-${version}-arm64.dmg`;
const dmgPath = resolve(root, "release", dmgName);
try {
  readFileSync(dmgPath);
} catch {
  console.error(`DMG not found at: ${dmgPath}`);
  process.exit(1);
}

// 2. Upload to Vercel Blob
console.log("\nStep 2/4: Uploading DMG to Vercel Blob...");
run(`node scripts/upload-dmg.mjs "release/${dmgName}"`);

// 3. Update landing page version badge
console.log("\nStep 3/4: Updating landing page version...");
const pagePath = resolve(root, "landing/src/app/page.tsx");
let page = readFileSync(pagePath, "utf8");
// Update version badges in both EN and PT
page = page.replace(/hero_badge: "v[\d.]+ — FREE"/, `hero_badge: "v${version} — FREE"`);
page = page.replace(/hero_badge: "v[\d.]+ — GRATUITO"/, `hero_badge: "v${version} — GRATUITO"`);
// Update bottom version tag
page = page.replace(/v[\d.]+<\/span>/, `v${version}</span>`);
const { writeFileSync } = await import("fs");
writeFileSync(pagePath, page, "utf8");
console.log(`Updated landing page to v${version}`);

// 4. Commit and push
console.log("\nStep 4/4: Committing and pushing...");
run("git add package.json landing/src/app/page.tsx");
run(`git commit -m "Release Meeting Helper v${version}"`);
run("git push");

console.log(`\n=== Released Meeting Helper v${version} ===`);
console.log("Vercel will auto-deploy the landing page to meetinghelper.vercel.app");

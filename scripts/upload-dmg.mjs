#!/usr/bin/env node
/**
 * Upload DMG to Vercel Blob with versioned filename.
 * Deletes all old DMGs first, then uploads the new one.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=<token> node scripts/upload-dmg.mjs <path-to-dmg>
 *
 * The uploaded filename matches the source DMG filename so the browser
 * download shows the real version (e.g. "Meeting Helper-1.0.14-arm64.dmg").
 *
 * After uploading, updates landing/src/app/page.tsx DOWNLOAD_URL automatically.
 */
import { put, list, del } from "@vercel/blob";
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename } from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN env var");
  process.exit(1);
}

const dmgPath = process.argv[2];
if (!dmgPath) {
  console.error("Usage: node scripts/upload-dmg.mjs <path-to-dmg>");
  process.exit(1);
}

// Delete all existing DMGs first
const { blobs } = await list({ token: BLOB_TOKEN });
const oldDmgs = blobs.filter((b) => b.pathname.endsWith(".dmg"));
for (const old of oldDmgs) {
  await del(old.url, { token: BLOB_TOKEN });
  console.log(`Deleted old: ${old.pathname}`);
}

// Upload new DMG with its real filename
const fileName = basename(dmgPath);
const file = readFileSync(resolve(dmgPath));
const { url } = await put(fileName, file, {
  access: "public",
  token: BLOB_TOKEN,
});

console.log(`Uploaded: ${url}`);

// Update landing page DOWNLOAD_URL (relative path through rewrite proxy)
const pagePath = resolve("landing/src/app/page.tsx");
try {
  let page = readFileSync(pagePath, "utf8");
  const encodedName = encodeURIComponent(fileName).replace(/%20/g, "%20");
  page = page.replace(
    /const DOWNLOAD_URL = ".*";/,
    `const DOWNLOAD_URL = "/download/${encodedName}";`
  );
  writeFileSync(pagePath, page, "utf8");
  console.log(`Updated landing page DOWNLOAD_URL`);
} catch (e) {
  console.error(`Warning: could not update landing page: ${e.message}`);
}

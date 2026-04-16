#!/usr/bin/env node
/**
 * Upload an installer (DMG or EXE) to Vercel Blob with versioned filename.
 * Deletes old installers of the same type first, then uploads the new one.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=<token> node scripts/upload-installer.mjs <path-to-file>
 *
 * The uploaded filename matches the source filename so the browser
 * download shows the real version (e.g. "Meeting Helper-1.0.14-arm64.dmg").
 *
 * After uploading, updates landing/src/app/page.tsx download URLs automatically.
 */
import { put, list, del } from "@vercel/blob";
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename, extname } from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN env var");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/upload-installer.mjs <path-to-installer>");
  process.exit(1);
}

const fileName = basename(filePath);
const ext = extname(fileName).toLowerCase(); // .dmg or .exe

// Delete old installers of the same type
const { blobs } = await list({ token: BLOB_TOKEN });
const oldFiles = blobs.filter((b) => b.pathname.endsWith(ext));
for (const old of oldFiles) {
  await del(old.url, { token: BLOB_TOKEN });
  console.log(`Deleted old: ${old.pathname}`);
}

// Upload new installer with its real filename
const file = readFileSync(resolve(filePath));
const { url } = await put(fileName, file, {
  access: "public",
  token: BLOB_TOKEN,
});

console.log(`Uploaded: ${url}`);

// Update landing page download URL for this platform
const pagePath = resolve("landing/src/app/page.tsx");
try {
  let page = readFileSync(pagePath, "utf8");
  const encodedName = encodeURIComponent(fileName).replace(/%20/g, "%20");
  const downloadPath = `/download/${encodedName}`;

  if (ext === ".dmg") {
    page = page.replace(
      /const DOWNLOAD_URL_MAC = ".*";/,
      `const DOWNLOAD_URL_MAC = "${downloadPath}";`
    );
    // Backward compat: also update DOWNLOAD_URL if it still exists
    page = page.replace(
      /const DOWNLOAD_URL = ".*";/,
      `const DOWNLOAD_URL = "${downloadPath}";`
    );
  } else if (ext === ".exe") {
    page = page.replace(
      /const DOWNLOAD_URL_WIN = ".*";/,
      `const DOWNLOAD_URL_WIN = "${downloadPath}";`
    );
  }

  writeFileSync(pagePath, page, "utf8");
  console.log(`Updated landing page download URL for ${ext}`);
} catch (e) {
  console.error(`Warning: could not update landing page: ${e.message}`);
}

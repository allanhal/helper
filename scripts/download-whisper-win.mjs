#!/usr/bin/env node
/**
 * Download pre-built whisper-cli.exe + DLLs for Windows.
 *
 * Binaries are stored as a GitHub release asset on the helper repo.
 * This script runs automatically during `pnpm install` on Windows,
 * or can be called manually: node scripts/download-whisper-win.mjs
 *
 * Skips download if whisper-win/ already has whisper-cli.exe.
 */
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const whisperDir = path.join(repoRoot, 'whisper-win')
const exePath = path.join(whisperDir, 'whisper-cli.exe')

// Skip if not Windows and not forced
if (process.platform !== 'win32' && !process.argv.includes('--force')) {
  console.log('[download-whisper-win] Skipped (not Windows)')
  process.exit(0)
}

// Skip if already downloaded
if (fs.existsSync(exePath)) {
  console.log('[download-whisper-win] whisper-cli.exe already exists, skipping')
  process.exit(0)
}

// Download from GitHub release artifact
const REPO = 'allanhal/helper'
const TAG = 'whisper-win-v1.7.5'
const ASSET_NAME = 'whisper-win-x64.zip'

async function getAssetUrl() {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`
    https.get(url, { headers: { 'User-Agent': 'helper-electron', Accept: 'application/json' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        const release = JSON.parse(data)
        const asset = release.assets?.find(a => a.name === ASSET_NAME)
        if (!asset) {
          reject(new Error(`Asset "${ASSET_NAME}" not found in release ${TAG}`))
          return
        }
        resolve(asset.browser_download_url)
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, hops = 0) => {
      if (hops > 10) { reject(new Error('Too many redirects')); return }
      https.get(u, { headers: { 'User-Agent': 'helper-electron' } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          follow(res.headers.location, hops + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const stream = fs.createWriteStream(dest)
        res.pipe(stream)
        stream.on('finish', () => { stream.close(resolve) })
        stream.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

try {
  console.log(`[download-whisper-win] Fetching release ${TAG}...`)
  const assetUrl = await getAssetUrl()
  console.log(`[download-whisper-win] Downloading ${ASSET_NAME}...`)

  fs.mkdirSync(whisperDir, { recursive: true })
  const zipPath = path.join(whisperDir, ASSET_NAME)
  await download(assetUrl, zipPath)

  // Extract zip
  console.log('[download-whisper-win] Extracting...')
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${whisperDir}' -Force"`, { stdio: 'inherit' })
  } else {
    execSync(`unzip -o "${zipPath}" -d "${whisperDir}"`, { stdio: 'inherit' })
  }

  // Clean up zip
  fs.unlinkSync(zipPath)

  // Verify
  if (fs.existsSync(exePath)) {
    console.log('[download-whisper-win] Done — whisper-cli.exe ready')
  } else {
    console.error('[download-whisper-win] ERROR: whisper-cli.exe not found after extraction')
    process.exit(1)
  }
} catch (err) {
  console.error(`[download-whisper-win] Failed: ${err.message}`)
  console.error('[download-whisper-win] You can manually download from:')
  console.error(`  https://github.com/${REPO}/releases/tag/${TAG}`)
  process.exit(1)
}

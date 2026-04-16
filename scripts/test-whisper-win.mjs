#!/usr/bin/env node
/**
 * Smoke-test whisper-win/whisper-cli.exe via Wine on macOS.
 *
 * Validates the Windows binary end-to-end:
 *   - ensures a tiny model + known WAV sample are present (downloads if missing)
 *   - runs whisper-cli.exe under wine
 *   - asserts the transcription contains expected text
 *
 * Usage: node scripts/test-whisper-win.mjs
 * Requires: wine on PATH (`brew install --cask wine-stable`)
 */
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const fixtures = path.join(repoRoot, 'test-fixtures')
const exePath = path.join(repoRoot, 'whisper-win', 'whisper-cli.exe')
const modelPath = path.join(fixtures, 'ggml-tiny.bin')
const wavPath = path.join(fixtures, 'jfk.wav')

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
const WAV_URL = 'https://github.com/ggerganov/whisper.cpp/raw/master/samples/jfk.wav'
const EXPECTED_SUBSTRING = 'my fellow Americans'

function die(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

function findWine() {
  for (const bin of ['wine', 'wine64']) {
    const r = spawnSync('which', [bin], { encoding: 'utf8' })
    if (r.status === 0) return r.stdout.trim()
  }
  const candidates = [
    '/usr/local/bin/wine',
    '/opt/homebrew/bin/wine',
    '/Applications/Wine Stable.app/Contents/MacOS/wine',
    '/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine',
  ]
  for (const p of candidates) if (fs.existsSync(p)) return p
  return null
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return
  console.log(`Downloading ${path.basename(dest)}...`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await new Promise((resolve, reject) => {
    const get = (u) => https.get(u, { headers: { 'User-Agent': 'helper-test' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        get(res.headers.location); return
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }).on('error', reject)
    get(url)
  })
  console.log(`  saved ${dest} (${fs.statSync(dest).size} bytes)`)
}

async function main() {
  if (!fs.existsSync(exePath)) die(`whisper-cli.exe not found at ${exePath}`)
  const wine = findWine()
  if (!wine) die('wine not found on PATH. Install: brew install --cask wine-stable')

  await download(MODEL_URL, modelPath)
  await download(WAV_URL, wavPath)

  console.log(`Running: ${wine} ${exePath} -m ${modelPath} -f ${wavPath} -l auto`)
  const child = spawn(wine, [exePath, '-m', modelPath, '-f', wavPath, '-l', 'auto', '-otxt', '-oj'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WINEDEBUG: '-all' },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d) })
  child.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d) })

  const code = await new Promise(r => child.on('close', r))
  console.log(`\n--- exit code: ${code} ---`)

  if (code !== 0) die(`whisper-cli exited with code ${code}\nstderr:\n${stderr}`)
  if (!stdout.includes(EXPECTED_SUBSTRING)) {
    die(`expected stdout to contain "${EXPECTED_SUBSTRING}"\nstdout:\n${stdout}`)
  }
  console.log(`\nOK — transcription contains "${EXPECTED_SUBSTRING}"`)
}

main().catch(e => die(e.message || String(e)))

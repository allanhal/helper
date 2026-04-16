#!/usr/bin/env node
/**
 * Bump the package.json patch version and emit dist-electron/build-info.json
 * with git short SHA + ISO build timestamp. Runs before every `pnpm dist`.
 *
 * Behavior:
 *   - Reads package.json version, bumps patch (1.0.0 -> 1.0.1).
 *   - Writes new version back to package.json.
 *   - Writes dist-electron/build-info.json: { version, gitSha, buildTime }.
 *   - Does NOT git-commit or git-tag (per project policy).
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const pkgPath = path.join(repoRoot, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!m) throw new Error(`Cannot parse version "${version}"`)
  const major = Number(m[1])
  const minor = Number(m[2])
  const patch = Number(m[3]) + 1
  return `${major}.${minor}.${patch}`
}

function safeGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'nogit'
  }
}

const oldVersion = pkg.version
const newVersion = bumpPatch(oldVersion)
pkg.version = newVersion

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

const gitSha = safeGitSha()
const buildTime = new Date().toISOString()

const distElectron = path.join(repoRoot, 'dist-electron')
fs.mkdirSync(distElectron, { recursive: true })
const buildInfo = { version: newVersion, gitSha, buildTime }
fs.writeFileSync(
  path.join(distElectron, 'build-info.json'),
  JSON.stringify(buildInfo, null, 2) + '\n',
  'utf8',
)

// eslint-disable-next-line no-console
console.log(`[bump-version] ${oldVersion} -> ${newVersion} (git ${gitSha}, ${buildTime})`)

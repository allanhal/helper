#!/usr/bin/env node
/**
 * Bump the package.json version and emit dist-electron/build-info.json
 * with git short SHA + ISO build timestamp. Runs before every `pnpm dist`.
 *
 * Usage:
 *   node scripts/bump-version.mjs              # defaults to --patch
 *   node scripts/bump-version.mjs --patch      # 1.0.17 -> 1.0.18
 *   node scripts/bump-version.mjs --minor      # 1.0.17 -> 1.1.0
 *   node scripts/bump-version.mjs --major      # 1.0.17 -> 2.0.0
 *
 * SemVer rules (see CLAUDE.md § Versioning):
 *   PATCH — bug fixes, typos, dependency bumps, build fixes
 *   MINOR — new features, new UI, new model support (backward-compatible)
 *   MAJOR — breaking changes, DB migrations, config format changes
 *
 * Behavior:
 *   - Reads package.json version, bumps per flag (default: patch).
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

function parseLevel() {
  const args = process.argv.slice(2)
  if (args.includes('--major')) return 'major'
  if (args.includes('--minor')) return 'minor'
  return 'patch'
}

function bumpVersion(version, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!m) throw new Error(`Cannot parse version "${version}"`)
  const major = Number(m[1])
  const minor = Number(m[2])
  const patch = Number(m[3])
  switch (level) {
    case 'major': return `${major + 1}.0.0`
    case 'minor': return `${major}.${minor + 1}.0`
    default:      return `${major}.${minor}.${patch + 1}`
  }
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

const level = parseLevel()
const oldVersion = pkg.version
const newVersion = bumpVersion(oldVersion, level)
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
console.log(`[bump-version] ${oldVersion} -> ${newVersion} [${level}] (git ${gitSha}, ${buildTime})`)

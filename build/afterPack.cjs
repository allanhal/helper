/**
 * electron-builder afterPack hook — Tier 1 size reductions.
 *
 * Runs after packaging and before signing so electron-builder's re-sign
 * step repairs the CodeResources map automatically.
 *
 * Deletions (all guarded):
 *   - libvk_swiftshader.dylib, libEGL.dylib, libGLESv2.dylib, vk_swiftshader_icd.json
 *     (ANGLE / SwiftShader — only needed for WebGL software fallback; app has
 *     no <canvas>/WebGL/<video> element usage)
 *   - chrome_100_percent.pak / chrome_200_percent.pak
 *     (Chrome UI images; Electron apps rarely use them; resources.pak stays)
 *
 * Future experiments (left commented — may break signing):
 *   - strip -x on Electron Framework binary
 *   - LC_CODE_SIGNATURE rewriting
 */

const fs = require('node:fs')
const path = require('node:path')

function safeUnlink(absPath) {
  try {
    if (fs.existsSync(absPath)) {
      const stat = fs.lstatSync(absPath)
      if (stat.isDirectory()) {
        fs.rmSync(absPath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(absPath)
      }
      // eslint-disable-next-line no-console
      console.log(`[afterPack] deleted ${path.relative(process.cwd(), absPath)}`)
      return true
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[afterPack] failed to delete ${absPath}: ${err && err.message}`)
  }
  return false
}

module.exports = async function afterPack(ctx) {
  const { appOutDir, packager } = ctx
  // Only apply to mac builds; other platforms have different layouts.
  const platform = (packager && packager.platform && packager.platform.name) || ''
  if (platform !== 'mac') {
    // eslint-disable-next-line no-console
    console.log(`[afterPack] skipped (platform=${platform})`)
    return
  }

  const productName = (packager && packager.appInfo && packager.appInfo.productFilename) || 'Helper'
  const appRoot = path.join(appOutDir, `${productName}.app`)
  const frameworkA = path.join(
    appRoot,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
  )
  const libs = path.join(frameworkA, 'Libraries')
  const resources = path.join(frameworkA, 'Resources')

  const toDelete = [
    path.join(libs, 'libvk_swiftshader.dylib'),
    path.join(libs, 'libEGL.dylib'),
    path.join(libs, 'libGLESv2.dylib'),
    path.join(libs, 'vk_swiftshader_icd.json'),
    path.join(resources, 'chrome_100_percent.pak'),
    path.join(resources, 'chrome_200_percent.pak'),
  ]

  let deleted = 0
  for (const p of toDelete) {
    if (safeUnlink(p)) deleted += 1
  }
  // eslint-disable-next-line no-console
  console.log(`[afterPack] tier1 complete — deleted ${deleted}/${toDelete.length} target(s)`)

  // ---------------------------------------------------------------------------
  // Future size experiments (commented — enable only if signing still works):
  //
  //   const { execFileSync } = require('node:child_process')
  //   const fwBin = path.join(frameworkA, 'Electron Framework')
  //   execFileSync('strip', ['-x', fwBin], { stdio: 'inherit' })
  //
  // Strip debug symbols from unsigned dylibs (re-sign pass will resign them).
  // ---------------------------------------------------------------------------
}

import { spawn } from 'child_process'
import http from 'http'

function waitForServer(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      http
        .get(`http://localhost:${port}`, () => {
          resolve()
        })
        .on('error', () => {
          if (Date.now() - start > timeout) {
            reject(new Error(`Server didn't start within ${timeout}ms`))
          } else {
            setTimeout(check, 500)
          }
        })
    }
    check()
  })
}

async function main() {
  // Start Vite
  const vite = spawn('pnpm', ['vite'], { stdio: 'inherit' })

  try {
    console.log('Waiting for Vite dev server...')
    await waitForServer(5173)
    console.log('Vite ready')

    // Build electron
    const build = spawn('pnpm', ['run', 'build:electron'], { stdio: 'inherit' })
    await new Promise((resolve, reject) => {
      build.on('close', (code) => (code === 0 ? resolve(null) : reject(new Error(`Build failed with code ${code}`))))
    })

    // Start Electron
    const electron = spawn('pnpm', ['electron', '.'], { stdio: 'inherit' })

    // Forward signals to all processes
    const cleanup = () => {
      vite.kill('SIGTERM')
      electron.kill('SIGTERM')
      process.exit(0)
    }
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    // Wait for Electron to exit
    await new Promise((resolve) => {
      electron.on('close', () => {
        cleanup()
        resolve()
      })
    })
  } catch (error) {
    console.error(error)
    vite.kill('SIGTERM')
    process.exit(1)
  }
}

main()

// global-setup.ts
import { spawnSync } from 'bun'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const DIST_HTML = path.join(ROOT, 'dist/web/index.html')
const INPUT_DIRS = [
  path.join(ROOT, 'src/web/client'),
  path.join(ROOT, 'src/web/shared'),
  path.join(ROOT, 'vite.config.ts'),
]

function shouldBuild(): boolean {
  // Force rebuild in CI
  if (process.env.CI) {
    console.log('CI environment detected -> forcing build')
    return true
  }

  // No output -> must build
  if (!fs.existsSync(DIST_HTML)) {
    console.log('dist/web/index.html missing -> full build required')
    return true
  }

  try {
    const outputStat = fs.statSync(DIST_HTML)
    const outputMtimeMs = outputStat.mtimeMs

    for (const dirOrFile of INPUT_DIRS) {
      if (!fs.existsSync(dirOrFile)) continue

      const stat = fs.statSync(dirOrFile)
      if (stat.isDirectory()) {
        const newestInDir = findNewestMtime(dirOrFile)
        if (newestInDir > outputMtimeMs) {
          console.log(`Newer file found in ${dirOrFile} (${new Date(newestInDir).toISOString()})`)
          return true
        }
      } else {
        if (stat.mtimeMs > outputMtimeMs) {
          console.log(`Config/source newer: ${dirOrFile} (${new Date(stat.mtimeMs).toISOString()})`)
          return true
        }
      }
    }

    console.log('All inputs older than dist/web/index.html -> skipping build')
    return false
  } catch (err) {
    console.warn('Error checking timestamps, forcing rebuild:', err)
    return true
  }
}

function findNewestMtime(dir: string): number {
  let max = 0

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        try {
          const mtimeMs = fs.statSync(full).mtimeMs
          if (mtimeMs > max) max = mtimeMs
        } catch {
          // ignore permission/ENOENT issues in walk
        }
      }
    }
  }

  walk(dir)
  return max
}

export default function globalSetup() {
  if (!shouldBuild()) {
    return
  }

  console.log('Building web client (Vite)...')

  const result = spawnSync(['bun', 'build:prod'], {
    cwd: ROOT,
    stdio: ['inherit', 'inherit', 'inherit'],
  })

  if (!result.success) {
    console.error(`Build failed with exit code ${result.exitCode}`)
    process.exit(result.exitCode ?? 1)
  }

  console.log('Build completed successfully')
}

import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// This test ensures the npm package can be packed, installed, and serves assets correctly

async function run(cmd: string[], opts: { cwd?: string } = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

function findPackFileFromOutput(stdout: string): string {
  const lines = stdout.trim().split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line && line.trim().endsWith('.tgz')) return line.trim()
  }
  throw new Error('No .tgz file found in npm pack output')
}

describe('npm pack integration', () => {
  let tempDir: string
  let packFile: string | null = null
  let serverProcess: ReturnType<typeof Bun.spawn> | null = null

  afterEach(async () => {
    // Cleanup server process
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }

    // Cleanup temp directory
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'AbortError') {
          throw error
        }
      }
    }

    // Cleanup pack file
    if (packFile) {
      await run(['rm', '-f', packFile])
    }
  })

  it('packs, installs, and serves assets correctly', async () => {
    // 1) Create temp workspace
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-pty-'))

    // 2) Pack the package
    const pack = await run(['npm', 'pack'])
    expect(pack.code).toBe(0)
    const tgz = findPackFileFromOutput(pack.stdout)
    packFile = tgz
    const tgzPath = join(process.cwd(), tgz)

    // List tarball contents to find an asset
    const list = await run(['tar', '-tf', tgzPath])
    expect(list.code).toBe(0)
    const files = list.stdout.split(/\r?\n/).filter(Boolean)
    const jsAsset = files.find((f) => /package\/dist\/web\/assets\/[^/]+\.js$/.test(f))
    expect(jsAsset).toBeDefined()
    const assetName = jsAsset!.replace('package/dist/web/assets/', '')

    // 3) Install in temp workspace
    const install = await run(['bun', 'install', tgzPath], { cwd: tempDir })
    expect(install.code).toBe(0)

    // Copy the server script to tempDir
    mkdirSync(join(tempDir, 'test'))
    copyFileSync(
      join(process.cwd(), 'test/start-server.ts'),
      join(tempDir, 'test', 'start-server.ts')
    )

    // Verify the package structure
    const packageDir = join(tempDir, 'node_modules/opencode-pty')
    expect(existsSync(join(packageDir, 'src/plugin/pty/manager.ts'))).toBe(true)
    expect(existsSync(join(packageDir, 'dist/web/index.html'))).toBe(true)
    const portFile = join('/tmp', 'test-server-port-0.txt')
    if (await Bun.file(portFile).exists()) {
      await Bun.file(portFile).delete()
    }
    serverProcess = Bun.spawn(['bun', 'run', 'test/start-server.ts'], {
      cwd: tempDir,
      env: { ...process.env, NODE_ENV: 'test' },
      stdout: 'inherit',
      stderr: 'inherit',
    })

    async function waitForPortFile() {
      // Fallback timeout to resolve with 0 after 500ms.
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(0), 500)
      })

      // Polling logic as a separate async function.
      const pollForFile = async () => {
        while (!(await Bun.file(portFile).exists())) {
          await new Promise(setImmediate)
        }
        const bytes = await Bun.file(portFile).bytes()
        const port = parseInt(new TextDecoder().decode(bytes).trim(), 10)
        return port
      }

      // Race the timeout against the polling.
      return await Promise.race([timeoutPromise, pollForFile()])
    }

    async function waitWithRetry() {
      let retries = 20
      do {
        const port = await waitForPortFile()
        if (port !== 0) return port
        await new Promise(setImmediate)
        retries--
      } while (retries > 0)
      return 0
    }

    const port = await waitWithRetry()
    expect(port).not.toBe(0)

    // Wait for server to be ready
    let retries = 20 // 10 seconds
    while (retries > 0) {
      try {
        const response = await fetch(`http://localhost:${port}/api/sessions`)
        if (response.ok) break
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'AbortError') {
          throw error
        }
      }
      await new Promise(setImmediate)
      retries--
    }
    expect(retries).toBeGreaterThan(0) // Server should be ready

    // 5) Fetch assets
    const assetResponse = await fetch(`http://localhost:${port}/assets/${assetName}`)
    expect(assetResponse.status).toBe(200)
    // Could add more specific checks here, like content-type or specific assets

    // 6) Fetch index.html and verify it's the built version
    const indexResponse = await fetch(`http://localhost:${port}/`)
    expect(indexResponse.status).toBe(200)
    const indexContent = await indexResponse.text()
    expect(indexContent).not.toContain('main.tsx') // Fails if raw HTML is served
    expect(indexContent).toContain('/assets/') // Confirms built assets are referenced
  }, 30000)
})

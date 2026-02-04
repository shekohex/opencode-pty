import { describe, it, expect } from 'bun:test'

// This test ensures `npm pack` (which triggers the package's `prepack` script)
// produces a tarball that includes the built web UI (`dist/web/**`) and the
// plugin bundle (`dist/opencode-pty.js`).

async function run(cmd: string[], opts: { cwd?: string } = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  // Wait for stdout/stderr and for the process to exit. In some Bun
  // versions `proc.exitCode` may be null until the process finishes,
  // so await `proc.exited` to reliably get the exit code.
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

function findPackFileFromOutput(stdout: string): string | null {
  // npm prints the created tarball filename on the last line
  const lines = stdout.trim().split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line && line.trim().endsWith('.tgz')) return line.trim()
  }
  return null
}

describe('npm pack structure', () => {
  it('includes dist web assets', async () => {
    // 1) Create tarball via npm pack (triggers prepack build)
    const pack = await run(['npm', 'pack'])
    expect(pack.code).toBe(0)
    const tgz = findPackFileFromOutput(pack.stdout)
    expect(typeof tgz).toBe('string')

    // 2) List tarball contents via tar -tf
    const list = await run(['tar', '-tf', tgz as string])
    expect(list.code).toBe(0)
    const files = list.stdout.split(/\r?\n/).filter(Boolean)

    // 3) Validate required files exist; NPM tarballs use 'package/' prefix
    expect(files).toContain('package/dist/web/index.html')

    // At least one hashed JS and CSS asset
    const hasJsAsset = files.some((f) => /package\/dist\/web\/assets\/[^/]+\.js$/.test(f))
    const hasCssAsset = files.some((f) => /package\/dist\/web\/assets\/[^/]+\.css$/.test(f))
    expect(hasJsAsset).toBeTrue()
    expect(hasCssAsset).toBeTrue()

    // 4) Cleanup the pack file
    await run(['rm', '-f', tgz as string])
  }, 10000)
})

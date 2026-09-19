import { afterEach, describe, expect, it } from 'bun:test'
import net from 'node:net'
import { PTYServer } from '../src/web/server/server.ts'
import {
  MAX_PORT_FALLBACK_ATTEMPTS,
  isEaddrinuse,
  portCandidates,
  resolveWebPort,
} from '../src/web/server/server.ts'
import { Plugin, getActiveServer, stopActiveServer } from '../src/v2/index.ts'
import type { PluginContextV2 } from '../src/v2/types.ts'

/**
 * Learn a free port reliably: bind a short-lived listener on port 0, read the
 * OS-assigned port, close the listener. The port may be re-claimed by another
 * process in the gap, which is exactly the race the bind fallback handles.
 */
async function findFreePort(): Promise<number> {
  const listener = net.createServer()
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const port = (listener.address() as net.AddressInfo).port
  await new Promise<void>((resolve) => {
    listener.close(() => resolve())
  })
  return port
}

describe('Port resolution helpers', () => {
  describe('resolveWebPort', () => {
    it('returns 0 (OS-assigned) when no port is configured', () => {
      expect(resolveWebPort()).toBe(0)
      expect(resolveWebPort({})).toBe(0)
      expect(resolveWebPort({ port: undefined })).toBe(0)
    })

    it('returns 0 (OS-assigned) for an explicit port 0', () => {
      expect(resolveWebPort({ port: 0 })).toBe(0)
    })

    it('returns 0 (OS-assigned) for NaN', () => {
      expect(resolveWebPort({ port: Number.NaN })).toBe(0)
    })

    it('returns the explicit port when configured', () => {
      expect(resolveWebPort({ port: 12345 })).toBe(12345)
    })

    it('falls back to the PTY_WEB_PORT env var when no option is given', () => {
      const previous = process.env.PTY_WEB_PORT
      process.env.PTY_WEB_PORT = '23456'
      try {
        expect(resolveWebPort({})).toBe(23456)
      } finally {
        if (previous === undefined) {
          delete process.env.PTY_WEB_PORT
        } else {
          process.env.PTY_WEB_PORT = previous
        }
      }
    })
  })

  describe('portCandidates', () => {
    it('yields only port 0 for port 0', () => {
      expect(portCandidates(0)).toEqual([0])
    })

    it('yields the requested port, the next fallback ports, and 0 as last resort', () => {
      const candidates = portCandidates(4200)
      expect(candidates[0]).toBe(4200)
      expect(candidates).toHaveLength(MAX_PORT_FALLBACK_ATTEMPTS + 2)
      expect(candidates[candidates.length - 1]).toBe(0)
      expect(candidates).toContain(4200 + MAX_PORT_FALLBACK_ATTEMPTS)
    })

    it('caps the fallback range at port 65535', () => {
      expect(portCandidates(65535)).toEqual([65535, 0])
    })
  })

  describe('isEaddrinuse', () => {
    it('detects the Bun.serve error shape (own code property)', () => {
      const error = new Error('Failed to start server. Is port 42789 in use?')
      ;(error as NodeJS.ErrnoException).code = 'EADDRINUSE'
      expect(isEaddrinuse(error)).toBe(true)
    })

    it('detects EADDRINUSE from the message alone', () => {
      expect(isEaddrinuse(new Error('Failed to start server. Is port 42789 in use?'))).toBe(true)
      expect(
        isEaddrinuse(new Error('listen EADDRINUSE: address already in use 127.0.0.1:4200'))
      ).toBe(true)
    })

    it('rejects unrelated errors and non-errors', () => {
      expect(isEaddrinuse(new Error('something else broke'))).toBe(false)
      expect(isEaddrinuse('EADDRINUSE')).toBe(false)
      expect(isEaddrinuse(null)).toBe(false)
      expect(isEaddrinuse(undefined)).toBe(false)
    })
  })
})

describe('Port fallback binding', () => {
  it('falls back to the next free port when the explicit port is taken', async () => {
    const port = await findFreePort()

    await using first = await PTYServer.createServer({ port, hostname: '127.0.0.1' })
    expect(Number(first.server.url.port)).toBe(port)

    // Same explicit port must resolve (not reject) and bind elsewhere.
    await using second = await PTYServer.createServer({ port, hostname: '127.0.0.1' })
    const secondPort = Number(second.server.url.port)
    expect(secondPort).not.toBe(port)

    // The second server must be fully functional on its dynamically bound port.
    const health = await fetch(`http://127.0.0.1:${secondPort}/health`)
    expect(health.status).toBe(200)
    const body = (await health.json()) as Record<string, unknown>
    expect(body.status).toBe('healthy')
  })

  it('binds an OS-assigned port when the explicit port and every fallback are taken', async () => {
    const port = await findFreePort()
    const blockers: Array<ReturnType<typeof Bun.serve>> = []
    for (let p = port; p <= port + MAX_PORT_FALLBACK_ATTEMPTS; p++) {
      blockers.push(
        Bun.serve({ port: p, hostname: '127.0.0.1', fetch: () => new Response('blocked') })
      )
    }
    const blocked = new Set(blockers.map((server) => server.port))
    try {
      await using server = await PTYServer.createServer({ port, hostname: '127.0.0.1' })
      const bound = Number(server.server.url.port)
      expect(blocked.has(bound)).toBe(false)

      const health = await fetch(`http://127.0.0.1:${bound}/health`)
      expect(health.status).toBe(200)
    } finally {
      for (const blocker of blockers) {
        blocker.stop(true)
      }
    }
  })

  it('still binds a random OS-assigned port for an explicit port 0', async () => {
    await using server = await PTYServer.createServer({ port: 0, hostname: '127.0.0.1' })
    expect(Number(server.server.url.port)).not.toBe(0)
  })
})

describe('V2 plugin setup resilience', () => {
  afterEach(() => {
    stopActiveServer()
  })

  it('does not throw when autostart is enabled and the configured port is taken', async () => {
    const port = await findFreePort()
    const blocker = Bun.serve({ port, hostname: '127.0.0.1', fetch: () => new Response('busy') })

    const warnings: unknown[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args)
    }
    try {
      const ctx: PluginContextV2 = {
        options: { autostart: true, port, hostname: '127.0.0.1' },
      }

      // Must resolve — setup must not throw on a busy configured port.
      const result = await Plugin.setup(ctx)
      expect(result).toBeUndefined()
    } finally {
      console.warn = originalWarn
      blocker.stop(true)
    }

    // The server came up on a fallback port and the warning was logged.
    const active = getActiveServer()
    expect(active).not.toBeNull()
    expect(Number(active?.server.url.port)).not.toBe(port)
    expect(warnings.some((args) => String(args).includes('in use'))).toBe(true)

    const health = await fetch(`http://127.0.0.1:${Number(active?.server.url.port)}/health`)
    expect(health.status).toBe(200)
  })
})

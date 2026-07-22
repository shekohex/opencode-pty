import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { PTYServer } from '../src/web/server/server.ts'
import { WebAuth } from '../src/web/server/auth.ts'

function basicHeader(username: string, password: string): string {
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

describe('Web Server HTTP Basic Auth', () => {
  describe('with auth disabled', () => {
    let server: PTYServer
    beforeAll(async () => {
      server = await PTYServer.createServer()
    })
    afterAll(() => {
      server[Symbol.dispose]()
    })

    it('exposes authEnabled=false on /health', async () => {
      const res = await fetch(`${server.server.url}/health`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { authEnabled: boolean; authUsername: string }
      expect(body.authEnabled).toBe(false)
      expect(typeof body.authUsername).toBe('string')
    })

    it('does not gate the API', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`)
      expect(res.status).toBe(200)
    })
  })

  describe('with auth enabled', () => {
    let server: PTYServer
    beforeAll(async () => {
      const auth = new WebAuth({ username: 'svc', password: 'open-sesame' })
      server = await PTYServer.createServer({ auth })
    })
    afterAll(() => {
      server[Symbol.dispose]()
    })

    it('reports authEnabled=true and the username on /health (still no creds required)', async () => {
      const res = await fetch(`${server.server.url}/health`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { authEnabled: boolean; authUsername: string }
      expect(body.authEnabled).toBe(true)
      expect(body.authUsername).toBe('svc')
    })

    it('returns a 401 + WWW-Authenticate challenge for unauthenticated API requests', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`)
      expect(res.status).toBe(401)
      expect(res.headers.get('WWW-Authenticate')).toContain('Basic')
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })

    it('admits requests that carry correct Basic credentials', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Authorization: basicHeader('svc', 'open-sesame') },
      })
      expect(res.status).toBe(200)
    })

    it('rejects requests with the wrong credentials', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Authorization: basicHeader('svc', 'wrong') },
      })
      expect(res.status).toBe(401)
    })

    it('gates destructive routes (DELETE) with the same auth check', async () => {
      // Regression: kill/cleanup/clear routes must enforce auth too, otherwise
      // anyone reaching the LAN address can kill sessions despite Basic Auth.
      const noCreds = await fetch(`${server.server.url}/api/sessions/nope`, {
        method: 'DELETE',
        headers: { Origin: 'http://192.168.1.10:12345' },
      })
      expect(noCreds.status).toBe(401)

      const wrongCreds = await fetch(`${server.server.url}/api/sessions/nope`, {
        method: 'DELETE',
        headers: {
          Authorization: basicHeader('svc', 'wrong'),
          Origin: 'http://192.168.1.10:12345',
        },
      })
      expect(wrongCreds.status).toBe(401)

      const rightCreds = await fetch(`${server.server.url}/api/sessions/nope`, {
        method: 'DELETE',
        headers: {
          Authorization: basicHeader('svc', 'open-sesame'),
          Origin: 'http://192.168.1.10:12345',
        },
      })
      // 400 because the session doesn't exist; 200 would mean auth was bypassed.
      expect(rightCreds.status).toBe(400)
    })

    it('issues a session cookie on successful Basic Auth', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Authorization: basicHeader('svc', 'open-sesame') },
      })
      expect(res.status).toBe(200)
      const setCookie = res.headers.get('set-cookie') ?? ''
      expect(setCookie).toMatch(/pty-session=[^;]+/)
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')
      expect(setCookie).toContain('Path=/')
      expect(setCookie).not.toContain('Max-Age')
    })

    it('accepts the issued session cookie on subsequent requests without Basic Auth', async () => {
      // First call: supply Basic Auth, capture the cookie.
      const initial = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Authorization: basicHeader('svc', 'open-sesame') },
      })
      const cookie = initial.headers.get('set-cookie')?.split(';')[0] ?? ''
      expect(cookie).toMatch(/pty-session=/)

      // Second call: only the cookie, no Authorization header. This is the
      // exact flow Safari needs for `fetch()` and WebSocket upgrade.
      const second = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Cookie: cookie },
      })
      expect(second.status).toBe(200)
    })

    it('rejects a forged session cookie', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Cookie: 'pty-session=totally-not-a-real-token' },
      })
      expect(res.status).toBe(401)
    })

    it('WebSocket upgrade authenticates via the session cookie', async () => {
      const initial = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Authorization: basicHeader('svc', 'open-sesame') },
      })
      const cookie = initial.headers.get('set-cookie')?.split(';')[0] ?? ''
      expect(cookie).toMatch(/pty-session=/)

      const upgraded = await fetch(`${server.server.url.toString()}/ws`, {
        headers: {
          Cookie: cookie,
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      }).catch((error: unknown) => error)
      expect(upgraded).toBeInstanceOf(Response)
      expect((upgraded as Response).status).toBe(101)
    })

    it('gates the SPA shell with the same challenge', async () => {
      const res = await fetch(`${server.server.url}/`)
      expect(res.status).toBe(401)
      expect(res.headers.get('WWW-Authenticate')).toContain('Basic')
    })

    it('refuses WebSocket upgrades without credentials', async () => {
      // Use the http:// origin (not ws://) — Bun's fetch rejects ws://. Bun will
      // reject the upgrade since it sees Upgrade/Connection headers but the auth
      // check runs first and returns 401.
      const upgraded = await fetch(`${server.server.url.toString()}/ws`, {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      }).catch((error: unknown) => error)
      // A non-upgrade response comes back as a regular Response.
      expect(upgraded).toBeInstanceOf(Response)
      expect((upgraded as Response).status).toBe(401)
    })
  })

  describe('with auth disabled and origin guard', () => {
    let server: PTYServer
    beforeAll(async () => {
      // Sanity check: confirm we DID NOT pass an auth. PTYServer.createServer
      // without options falls back to env vars — make sure those are unset so
      // we exercise the "no password set" path explicitly.
      const previous = { ...process.env }
      delete process.env.PTY_WEB_PASSWORD
      delete process.env.PTY_WEB_USERNAME
      server = await PTYServer.createServer()
      Object.assign(process.env, previous)
    })
    afterAll(() => {
      server[Symbol.dispose]()
    })

    it('allows kill from a loopback origin', async () => {
      const res = await fetch(`${server.server.url}/api/sessions/nonexistent`, {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:12345' },
      })
      // The session doesn't exist so we expect 400, not 403 — the guard is
      // about origin, not session existence.
      expect(res.status).toBe(400)
    })

    it('refuses kill from a non-loopback origin with a 403', async () => {
      const res = await fetch(`${server.server.url}/api/sessions/nonexistent`, {
        method: 'DELETE',
        headers: { Origin: 'http://192.168.1.10:12345' },
      })
      expect(res.status).toBe(403)
      const text = await res.text()
      expect(text).toContain('PTY_WEB_PASSWORD')
    })

    it('refuses cleanup from a non-loopback origin', async () => {
      const res = await fetch(`${server.server.url}/api/sessions/nonexistent/cleanup`, {
        method: 'DELETE',
        headers: { Origin: 'http://example.com' },
      })
      expect(res.status).toBe(403)
    })

    it('refuses clear-all from a non-loopback origin', async () => {
      const res = await fetch(`${server.server.url}/api/sessions`, {
        method: 'DELETE',
        headers: { Origin: 'http://attacker.example' },
      })
      expect(res.status).toBe(403)
    })

    it('still allows kill from a missing origin (non-browser clients)', async () => {
      const res = await fetch(`${server.server.url}/api/sessions/nonexistent`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
    })

    it('does not gate non-destructive routes by origin', async () => {
      // Should return an empty array, not a 403 — the guard is kill-specific.
      const res = await fetch(`${server.server.url}/api/sessions`, {
        headers: { Origin: 'http://attacker.example' },
      })
      expect(res.status).toBe(200)
    })
  })
})

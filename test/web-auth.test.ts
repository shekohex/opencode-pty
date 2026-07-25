import { describe, expect, it } from 'bun:test'
import {
  isLoopbackHostRequest,
  isLoopbackOriginRequest,
  SESSION_COOKIE_NAME,
  WebAuth,
  WEB_AUTH_REALM,
} from '../src/web/server/auth.ts'

function basicHeader(username: string, password: string): string {
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

function cookieHeader(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`
}

describe('WebAuth', () => {
  describe('when no password is configured', () => {
    const auth = new WebAuth({ username: 'alice' })

    it('reports disabled and keeps the configured username', () => {
      expect(auth.isEnabled()).toBe(false)
      expect(auth.getConfig()).toEqual({ enabled: false, username: 'alice' })
    })

    it('lets every request pass through', () => {
      const result = auth.check(new Request('http://localhost/api/sessions'), '/api/sessions')
      expect(result.ok).toBe(true)
      expect(result.response).toBeUndefined()
    })

    it('does not require Basic Auth even when /health is targeted', () => {
      const result = auth.check(new Request('http://localhost/health'), '/health')
      expect(result.ok).toBe(true)
    })
  })

  describe('when a password is configured', () => {
    const auth = new WebAuth({ username: 'alice', password: 'hunter2' })

    it('reports enabled and exposes the username', () => {
      expect(auth.isEnabled()).toBe(true)
      expect(auth.getConfig()).toEqual({ enabled: true, username: 'alice' })
    })

    it('returns a 401 + WWW-Authenticate challenge for unauthenticated requests', () => {
      const result = auth.check(new Request('http://localhost/api/sessions'), '/api/sessions')
      expect(result.ok).toBe(false)
      const response = result.response
      expect(response).toBeDefined()
      expect(response?.status).toBe(401)
      expect(response?.headers.get('WWW-Authenticate')).toBe(
        `Basic realm="${WEB_AUTH_REALM}", charset="UTF-8"`
      )
      expect(response?.headers.get('Cache-Control')).toBe('no-store')
    })

    it('admits requests that carry the right credentials', () => {
      const req = new Request('http://localhost/api/sessions', {
        headers: { Authorization: basicHeader('alice', 'hunter2') },
      })
      const result = auth.check(req, '/api/sessions')
      expect(result.ok).toBe(true)
      // The same HMAC token is returned so the server can attach Set-Cookie.
      expect(typeof result.sessionToken).toBe('string')
      expect(result.sessionToken?.length).toBeGreaterThan(0)
    })

    it('admits requests carrying a valid session cookie', () => {
      const initial = auth.check(
        new Request('http://localhost/api/sessions', {
          headers: { Authorization: basicHeader('alice', 'hunter2') },
        }),
        '/api/sessions'
      )
      const token = initial.sessionToken ?? ''
      // No Authorization header — only the cookie. This is the path Safari
      // fails on without a session token.
      const result = auth.check(
        new Request('http://localhost/api/sessions', {
          headers: { Cookie: cookieHeader(token) },
        }),
        '/api/sessions'
      )
      expect(result.ok).toBe(true)
    })

    it('rejects requests with a forged or stale session cookie', () => {
      const result = auth.check(
        new Request('http://localhost/api/sessions', {
          headers: { Cookie: cookieHeader('not-a-real-token') },
        }),
        '/api/sessions'
      )
      expect(result.ok).toBe(false)
    })

    it('cookieHeader produces a session cookie (no Max-Age)', () => {
      const header = auth.cookieHeader('abc123')
      expect(header).toContain(`${SESSION_COOKIE_NAME}=abc123`)
      expect(header).toContain('HttpOnly')
      expect(header).toContain('SameSite=Lax')
      expect(header).toContain('Path=/')
      expect(header).not.toContain('Max-Age')
      expect(header).not.toContain('Expires')
    })

    it("a fresh WebAuth instance rejects the previous instance's token", () => {
      const token =
        auth.check(
          new Request('http://localhost/api/sessions', {
            headers: { Authorization: basicHeader('alice', 'hunter2') },
          }),
          '/api/sessions'
        ).sessionToken ?? ''
      // Simulates server restart: secret rotates, old cookies no longer
      // verify, the user is forced to re-authenticate.
      const freshAuth = new WebAuth({ username: 'alice', password: 'hunter2' })
      const result = freshAuth.check(
        new Request('http://localhost/api/sessions', {
          headers: { Cookie: cookieHeader(token) },
        }),
        '/api/sessions'
      )
      expect(result.ok).toBe(false)
    })

    it('rejects requests with the wrong password', () => {
      const req = new Request('http://localhost/api/sessions', {
        headers: { Authorization: basicHeader('alice', 'wrong') },
      })
      const result = auth.check(req, '/api/sessions')
      expect(result.ok).toBe(false)
    })

    it('rejects requests with the wrong username', () => {
      const req = new Request('http://localhost/api/sessions', {
        headers: { Authorization: basicHeader('mallory', 'hunter2') },
      })
      const result = auth.check(req, '/api/sessions')
      expect(result.ok).toBe(false)
    })

    it('treats malformed Basic headers as unauthorized', () => {
      const req = new Request('http://localhost/api/sessions', {
        headers: { Authorization: 'Basic !!not-base64!!' },
      })
      const result = auth.check(req, '/api/sessions')
      expect(result.ok).toBe(false)
    })

    it('treats Bearer headers as unauthorized', () => {
      const req = new Request('http://localhost/api/sessions', {
        headers: { Authorization: 'Bearer abcdef' },
      })
      const result = auth.check(req, '/api/sessions')
      expect(result.ok).toBe(false)
    })

    it('admits /health requests without credentials', () => {
      const result = auth.check(new Request('http://localhost/health'), '/health')
      expect(result.ok).toBe(true)
    })
  })

  describe('when the user is only partially specified', () => {
    it('falls back to the OS user when no username is configured', () => {
      const auth = new WebAuth({ password: 'hunter2' })
      expect(auth.isEnabled()).toBe(true)
      expect(auth.getConfig().username.length).toBeGreaterThan(0)
    })

    it('treats whitespace-only inputs as disabled / unset', () => {
      const auth = new WebAuth({ username: '   ', password: '   ' })
      expect(auth.isEnabled()).toBe(false)
    })
  })
})

describe('isLoopbackOriginRequest', () => {
  const cases: Array<{ origin: string | null; expected: boolean }> = [
    { origin: null, expected: true },
    { origin: 'http://localhost:8080', expected: true },
    { origin: 'http://127.0.0.1:8080', expected: true },
    { origin: 'http://[::1]:8080', expected: true },
    { origin: 'http://[::ffff:127.0.0.1]:8080', expected: true },
    { origin: 'http://192.168.1.10:8080', expected: false },
    { origin: 'http://example.com', expected: false },
    { origin: 'not-a-url', expected: false },
  ]

  for (const { origin, expected } of cases) {
    it(`returns ${String(expected)} for origin=${String(origin)}`, () => {
      const req = new Request('http://example.com/api/sessions', {
        headers: origin ? { Origin: origin } : {},
      })
      expect(isLoopbackOriginRequest(req)).toBe(expected)
    })
  }
})

describe('isLoopbackHostRequest', () => {
  // The `Host` header (used for WebSocket upgrade checks since non-browser
  // WS clients rarely send `Origin`) is `hostname[:port]`.
  const cases: Array<{ host: string | null; expected: boolean }> = [
    { host: null, expected: true },
    { host: 'localhost:60134', expected: true },
    { host: 'localhost', expected: true },
    { host: '127.0.0.1:60134', expected: true },
    { host: '127.0.0.1', expected: true },
    { host: '[::1]:60134', expected: true },
    { host: '[::1]', expected: true },
    { host: '192.168.1.10:60134', expected: false },
    { host: '192.168.1.10', expected: false },
    { host: 'example.com:443', expected: false },
  ]

  for (const { host, expected } of cases) {
    it(`returns ${String(expected)} for host=${String(host)}`, () => {
      const req = new Request('http://example.com/api/sessions', {
        headers: host ? { Host: host } : {},
      })
      expect(isLoopbackHostRequest(req)).toBe(expected)
    })
  }
})

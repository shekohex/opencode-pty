import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { userInfo } from 'node:os'

export const WEB_AUTH_REALM = 'OpenCode PTY Web Interface'

export const SESSION_COOKIE_NAME = 'pty-session'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

// IPv4-mapped IPv6 loopback in the URL canonicalized form. Both forms are
// commonly seen depending on whether the originator wrote the address in
// dotted-quad or IPv6 hex.
const IPV6_MAPPED_IPV4_LOOPBACK = new Set(['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:7f00:0:1'])

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (LOOPBACK_HOSTNAMES.has(normalized)) return true
  if (IPV6_MAPPED_IPV4_LOOPBACK.has(normalized)) return true
  // Defense-in-depth: when the URL parser didn't normalize to hex, recurse.
  if (normalized.startsWith('::ffff:')) {
    return isLoopbackHostname(normalized.slice('::ffff:'.length))
  }
  return false
}

/**
 * Returns true when the request's Origin header resolves to a loopback host
 * (or is absent — which is the case for many non-browser clients).
 *
 * The check is intentionally permissive for missing Origin: only browser-driven
 * cross-network calls expose an Origin we can verify, and the absence of one is
 * the same outcome as a loopback one for our purposes (we still allow it).
 */
export function isLoopbackOriginRequest(req: Request): boolean {
  const origin = req.headers.get('Origin')
  if (!origin) return true
  try {
    const url = new URL(origin)
    return isLoopbackHostname(url.hostname)
  } catch {
    return false
  }
}

/**
 * Variant of {@link isLoopbackOriginRequest} that inspects the `Host` header
 * instead of `Origin`. We need this for WebSocket upgrades because most
 * non-browser WS clients (and Bun's own `WebSocket` class) do NOT send an
 * `Origin` header on the upgrade — the only reliable signal of "did the
 * client reach us via a loopback address" is then the `Host` they connected
 * to (which mirrors how they typed the URL).
 */
export function isLoopbackHostRequest(req: Request): boolean {
  const host = req.headers.get('Host')
  if (!host) return true
  // Host is `hostname[:port]` — peel the port before checking.
  const hostname = host.replace(/:\d+$/, '')
  return isLoopbackHostname(hostname)
}

export interface WebAuthOptions {
  /** Plain-text password used for HTTP Basic Auth. Empty/undefined disables auth. */
  password?: string
  /**
   * Plain-text username. When empty the OS user that launched the process is
   * used (via `os.userInfo().username`, then $USER / $USERNAME fallbacks).
   */
  username?: string
}

export interface WebAuthConfig {
  enabled: boolean
  username: string
}

export interface AuthCheckResult {
  ok: boolean
  /**
   * Populated on a successful auth via session cookie OR HTTP Basic Auth so
   * callers can attach `Set-Cookie` to the response. When auth is disabled
   * or the request failed, this is `undefined`.
   */
  sessionToken?: string
  response?: Response
}

export class WebAuth {
  private readonly enabled: boolean
  private readonly username: string
  private readonly expectedUsername: Buffer
  private readonly expectedPassword: Buffer
  /**
   * Stateless session token: `HMAC(secret, username)`. The secret is
   * regenerated per process, so server restarts invalidate every cookie
   * (forcing a re-prompt) and there's no in-memory map to leak or sweep.
   */
  private readonly sessionToken: string
  private readonly secret: Buffer

  constructor(options: WebAuthOptions = {}) {
    const password = (options.password ?? '').trim()
    this.enabled = password.length > 0
    const explicitUsername = (options.username ?? '').trim()
    this.username = explicitUsername.length > 0 ? explicitUsername : safeOsUsername()
    this.expectedUsername = Buffer.from(this.username, 'utf8')
    this.expectedPassword = Buffer.from(password, 'utf8')
    this.secret = randomBytes(32)
    this.sessionToken = createHmac('sha256', this.secret).update(this.username).digest('base64url')
  }

  getConfig(): WebAuthConfig {
    return { enabled: this.enabled, username: this.username }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Build the `Set-Cookie` header value. No `Max-Age` / `Expires` is set so
   * the cookie behaves as a session cookie — the browser drops it on close,
   * which is exactly the lifecycle the user expects (re-prompt on browser
   * restart, transparent reuse inside the same session).
   */
  cookieHeader(sessionToken: string): string {
    return `${SESSION_COOKIE_NAME}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/`
  }

  /**
   * Validate the incoming request.
   *
   * Auth precedence: session cookie first (so Safari's reluctance to
   * re-send HTTP Basic Auth on `fetch()` and WebSocket upgrade requests
   * doesn't re-prompt after the first successful login), then HTTP Basic
   * Auth.
   */
  check(req: Request, path: string): AuthCheckResult {
    if (!this.enabled) return { ok: true }

    if (path === '/health') return { ok: true }

    // 1. Session cookie — same-origin fetch() and WebSocket upgrade requests
    //    both include cookies, so this is what stops Safari re-prompting.
    const cookieHeader = req.headers.get('Cookie')
    if (cookieHeader) {
      const token = parseSessionCookie(cookieHeader)
      if (token && constantTimeEqualsString(token, this.sessionToken)) {
        return { ok: true, sessionToken: this.sessionToken }
      }
    }

    // 2. HTTP Basic Auth. On success the same HMAC token is returned so the
    //    caller can attach it as `Set-Cookie`.
    const header = req.headers.get('Authorization')
    if (header) {
      const decoded = decodeBasicAuth(header)
      if (
        decoded &&
        constantTimeEquals(decoded.username, this.expectedUsername) &&
        constantTimeEquals(decoded.password, this.expectedPassword)
      ) {
        return { ok: true, sessionToken: this.sessionToken }
      }
    }

    return { ok: false, response: this.challenge() }
  }

  challenge(): Response {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': `Basic realm="${WEB_AUTH_REALM}", charset="UTF-8"`,
        'Cache-Control': 'no-store',
      },
    })
  }
}

function safeOsUsername(): string {
  try {
    const info = userInfo()
    if (info.username && info.username.length > 0) return info.username
  } catch {
    // userInfo() can throw inside restricted sandboxes; fall through.
  }
  if (process.env.USER && process.env.USER.length > 0) return process.env.USER
  if (process.env.USERNAME && process.env.USERNAME.length > 0) return process.env.USERNAME
  return 'user'
}

function constantTimeEquals(provided: string, expected: Buffer): boolean {
  const providedBuf = Buffer.from(provided ?? '', 'utf8')
  if (providedBuf.length !== expected.length) {
    // Run a dummy compare so the call duration stays independent of length,
    // partially defending against remote timing oracle for the credential.
    timingSafeEqual(expected, expected)
    return false
  }
  return timingSafeEqual(providedBuf, expected)
}

function constantTimeEqualsString(provided: string, expected: string): boolean {
  const a = Buffer.from(provided ?? '', 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

function decodeBasicAuth(header: string): { username: string; password: string } | null {
  if (!header.toLowerCase().startsWith('basic ')) return null
  const encoded = header.slice(6).trim()
  if (!encoded) return null
  let decoded: string
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    return null
  }
  const colon = decoded.indexOf(':')
  if (colon === -1) return null
  return {
    username: decoded.slice(0, colon),
    password: decoded.slice(colon + 1),
  }
}

/**
 * Pull the `pty-session` value out of a `Cookie:` header without pulling in
 * a full parser. Only the value of the named cookie is returned, so other
 * unrelated cookies on the request are ignored.
 */
function parseSessionCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name !== SESSION_COOKIE_NAME) continue
    const value = part.slice(eq + 1).trim()
    if (value.length > 0) return value
  }
  return null
}

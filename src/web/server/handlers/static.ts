import { readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { ASSET_CONTENT_TYPES } from '../../shared/constants.ts'

// ----- MODULE-SCOPE CONSTANTS -----
// Resolve project root regardless of whether we're running from source or dist/
const MODULE_DIR = resolve(import.meta.dir, '../../../..')
const PROJECT_ROOT = MODULE_DIR.replace(/[\\/]dist$/, '')
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
} as const
const STATIC_DIR = join(PROJECT_ROOT, 'dist/web')

export interface StaticAssets {
  /** Map of asset path → Response (e.g. `/assets/index-XYZ.js`). The SPA shell is excluded. */
  routes: Record<string, Response>
  /** The built `index.html` response, ready to be served at `/` and `/index.html`. */
  indexHtml: Response
}

export async function buildStaticRoutes(): Promise<StaticAssets> {
  const routes: Record<string, Response> = {}
  let indexHtml: Response | null = null
  const files = readdirSync(STATIC_DIR, { recursive: true })
  for (const file of files) {
    if (typeof file === 'string' && !statSync(join(STATIC_DIR, file)).isDirectory()) {
      const ext = extname(file)
      const routeKey = `/${file.replace(/\\/g, '/')}`
      const fullPath = join(STATIC_DIR, file)
      const fileObj = Bun.file(fullPath)
      const contentType = fileObj.type || ASSET_CONTENT_TYPES[ext] || 'application/octet-stream'
      const body = await fileObj.bytes()
      const response = new Response(body, {
        headers: {
          'Content-Type': contentType,
          ...SECURITY_HEADERS,
          // The SPA shell must never be cached long-term so deploys / config
          // changes are picked up on the next load. Assets are content-hashed
          // and immutable.
          'Cache-Control':
            routeKey === '/index.html'
              ? 'no-cache, must-revalidate'
              : 'public, max-age=31536000, immutable',
        },
      })
      if (routeKey === '/index.html') {
        indexHtml = response
      } else {
        routes[routeKey] = response
      }
    }
  }
  if (!indexHtml) {
    throw new Error(`buildStaticRoutes: ${join(STATIC_DIR, 'index.html')} not found`)
  }
  return { routes, indexHtml }
}

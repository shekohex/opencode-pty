import { resolve } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { ASSET_CONTENT_TYPES } from '../../shared/constants.ts'

// ----- MODULE-SCOPE CONSTANTS -----
const PROJECT_ROOT = resolve(import.meta.dir, '../../../..')
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
} as const
const STATIC_DIR = join(PROJECT_ROOT, 'dist/web')

export async function buildStaticRoutes(): Promise<Record<string, Response>> {
  const routes: Record<string, Response> = {}
  const files = readdirSync(STATIC_DIR, { recursive: true })
  for (const file of files) {
    if (typeof file === 'string' && !statSync(join(STATIC_DIR, file)).isDirectory()) {
      const ext = extname(file)
      const routeKey = `/${file.replace(/\\/g, '/')}` // e.g., /assets/js/bundle.js
      const fullPath = join(STATIC_DIR, file)
      const fileObj = Bun.file(fullPath)
      const contentType = fileObj.type || ASSET_CONTENT_TYPES[ext] || 'application/octet-stream'

      // Buffer all files in memory
      routes[routeKey] = new Response(await fileObj.bytes(), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          ...SECURITY_HEADERS,
        },
      })
    }
  }
  return routes
}

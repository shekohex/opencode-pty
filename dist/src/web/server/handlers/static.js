import { readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { ASSET_CONTENT_TYPES } from "../../shared/constants.js";
// ----- MODULE-SCOPE CONSTANTS -----
// Resolve project root regardless of whether we're running from source or dist/
const MODULE_DIR = resolve(import.meta.dir, '../../../..');
const PROJECT_ROOT = MODULE_DIR.replace(/[\\/]dist$/, '');
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
};
const STATIC_DIR = join(PROJECT_ROOT, 'dist/web');
export async function buildStaticRoutes() {
    const routes = {};
    const files = readdirSync(STATIC_DIR, { recursive: true });
    for (const file of files) {
        if (typeof file === 'string' && !statSync(join(STATIC_DIR, file)).isDirectory()) {
            const ext = extname(file);
            const routeKey = `/${file.replace(/\\/g, '/')}`; // e.g., /assets/js/bundle.js
            const fullPath = join(STATIC_DIR, file);
            const fileObj = Bun.file(fullPath);
            const contentType = fileObj.type || ASSET_CONTENT_TYPES[ext] || 'application/octet-stream';
            // Buffer all files in memory
            routes[routeKey] = new Response(await fileObj.bytes(), {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    ...SECURITY_HEADERS,
                },
            });
        }
    }
    return routes;
}
//# sourceMappingURL=static.js.map
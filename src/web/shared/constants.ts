// Web-specific constants for the web server and related components

// WebSocket and session related constants
export const WEBSOCKET_PING_INTERVAL = 30000
export const WEBSOCKET_RECONNECT_DELAY = 100
export const RETRY_DELAY = 500
export const SESSION_LOAD_TIMEOUT = 2000
export const OUTPUT_LOAD_TIMEOUT = 5000
export const SKIP_AUTOSELECT_KEY = 'skip-autoselect'

// Test-related constants
export const TEST_SERVER_PORT_BASE = 8765
export const TEST_TIMEOUT_BUFFER = 1000
export const TEST_SESSION_CLEANUP_DELAY = 500

// Asset and file serving constants
export const ASSET_CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

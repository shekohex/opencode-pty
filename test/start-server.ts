import { initManager, manager } from 'opencode-pty/plugin/pty/manager'
import { PTYServer } from 'opencode-pty/web/server/server'
import { OpencodeClient } from '@opencode-ai/sdk'
import { createApiClient } from 'opencode-pty/web/shared/api-client'

// Set NODE_ENV if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}

initManager(new OpencodeClient())

const server = await PTYServer.createServer()

// Only log in non-test environments or when explicitly requested

// Write port to file for tests to read
if (process.env.NODE_ENV === 'test') {
  const workerIndex = process.env.TEST_WORKER_INDEX || '0'
  if (!server.server.port) {
    throw new Error('Unix sockets not supported. File an issue if you need this feature.')
  }
  await Bun.write(`/tmp/test-server-port-${workerIndex}.txt`, server.server.port.toString())
}

const api = createApiClient(server.server.url.origin)

// Health check for test mode
if (process.env.NODE_ENV === 'test') {
  let retries = 200 // 20 seconds
  while (retries > 0) {
    try {
      const health = await api.health()
      if (health.status === 'healthy') {
        break
      }
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'AbortError') {
        throw error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    retries--
  }
  if (retries === 0) {
    console.error('Server failed to start properly after 10 seconds')
    process.exit(1)
  }
}

// Create test sessions for manual testing and e2e tests
if (process.env.NODE_ENV === 'test') {
  // Create an interactive bash session for e2e tests
  manager.spawn({
    command: 'bash',
    args: ['-i'], // Interactive bash
    description: 'Interactive bash session for e2e tests',
    parentSessionId: 'test-session',
  })
} else if (process.env.CI !== 'true') {
  manager.spawn({
    command: 'bash',
    args: [
      '-c',
      "echo 'Welcome to live streaming test'; echo 'Type commands and see real-time output'; for i in {1..100}; do echo \"$(date): Live update $i...\"; sleep 1; done",
    ],
    description: 'Live streaming test session',
    parentSessionId: 'live-test',
  })
}

// Keep the server running indefinitely
setInterval(() => {
  // Keep-alive check - server will continue running
}, 1000)

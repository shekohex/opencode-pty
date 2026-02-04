import { OpencodeClient } from '@opencode-ai/sdk'
import { initManager } from '../../src/plugin/pty/manager.ts'
import { PTYServer } from '../../src/web/server/server.ts'

initManager(new OpencodeClient())

const server = await PTYServer.createServer()

// Only log in non-test environments or when explicitly requested

// Write server URL to file for tests to read
if (process.env.NODE_ENV === 'test') {
  const workerIndex = process.env.TEST_WORKER_INDEX || '0'
  if (!server.server.url) {
    throw new Error('Server URL not available. File an issue if you need this feature.')
  }
  await Bun.write(`/tmp/test-server-port-${workerIndex}.txt`, server.server.url.href)
}

// Health check for test mode
if (process.env.NODE_ENV === 'test') {
  try {
    const response = await fetch(`${server.server.url}/api/sessions`)
    if (!response.ok) {
      console.error('Server health check failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('Server health check failed:', error)
    process.exit(1)
  }
}

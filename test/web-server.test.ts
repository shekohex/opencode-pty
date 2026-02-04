import { describe, it, expect, afterAll, beforeAll } from 'bun:test'
import {
  manager,
  registerRawOutputCallback,
  registerSessionUpdateCallback,
} from '../src/plugin/pty/manager.ts'
import { PTYServer } from '../src/web/server/server.ts'
import type { PTYSessionInfo } from '../src/plugin/pty/types.ts'
import { ManagedTestServer } from './utils.ts'

describe('Web Server', () => {
  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      await using server = await PTYServer.createServer()
      const url = server.server.url
      expect(url.hostname).toBe('localhost')
      expect(url.protocol).toBe('http:')
      expect(url.port).not.toBe(0)
      expect(url.port).not.toBe(8080) // Default port should be avoided
    })

    it('should support multiple server instances', async () => {
      await using server1 = await PTYServer.createServer()
      await using server2 = await PTYServer.createServer()
      expect(server1.server.url.port).not.toBe(server2.server.url.port)
    })

    it('should stop server correctly', async () => {
      const server = await PTYServer.createServer()
      expect(server.server.url).toBeTruthy()
      server[Symbol['dispose']]()
    })
  })

  describe('HTTP Endpoints', () => {
    let managedTestServer: ManagedTestServer
    let disposableStack: DisposableStack

    beforeAll(async () => {
      disposableStack = new DisposableStack()
      managedTestServer = await ManagedTestServer.create()
      disposableStack.use(managedTestServer)
    })

    afterAll(() => {
      disposableStack.dispose()
    })

    it('should serve built assets', async () => {
      const response = await fetch(managedTestServer.server.server.url)
      expect(response.status).toBe(200)
      const html = await response.text()

      // Should contain built HTML with assets
      expect(html).toContain('<!doctype html>')
      expect(html).toContain('PTY Sessions Monitor')
      expect(html).toContain('/assets/')
      expect(html).not.toContain('/main.tsx')
      expect(html).toContain('<div id="root"></div>')

      // Extract asset URLs from HTML
      const jsMatch = html.match(/src="\/assets\/([^"]+\.js)"/)
      const cssMatch = html.match(/href="\/assets\/([^"]+\.css)"/)

      expect(jsMatch).toBeTruthy()
      expect(cssMatch).toBeTruthy()

      if (!jsMatch || !cssMatch) {
        throw new Error('Failed to extract asset URLs from HTML')
      }

      const jsAsset = jsMatch[1]
      const jsResponse = await fetch(`${managedTestServer.server.server.url}/assets/${jsAsset}`)
      expect(jsResponse.status).toBe(200)
      const ct = jsResponse.headers.get('content-type')
      expect((ct || '').toLowerCase()).toMatch(/^(application|text)\/javascript(;.*)?$/)

      const cssAsset = cssMatch[1]
      const cssResponse = await fetch(`${managedTestServer.server.server.url}/assets/${cssAsset}`)
      expect(cssResponse.status).toBe(200)
      expect((cssResponse.headers.get('content-type') || '').toLowerCase()).toMatch(
        /^text\/css(;.*)?$/
      )
    })

    it('should serve HTML on root path', async () => {
      const response = await fetch(managedTestServer.server.server.url)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')

      const html = await response.text()
      expect(html).toContain('<!doctype html>')
      expect(html).toContain('PTY Sessions Monitor')
    })

    it('should return sessions list', async () => {
      const response = await fetch(`${managedTestServer.server.server.url}/api/sessions`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')

      const sessions = await response.json()
      expect(Array.isArray(sessions)).toBe(true)
    })

    it('should return individual session', async () => {
      // Create a test session first
      const session = manager.spawn({
        command: 'bash',
        args: [],
        description: 'Test session',
        parentSessionId: 'test',
      })
      const rawDataPromise = new Promise<string>((resolve) => {
        let rawDataTotal = ''
        registerRawOutputCallback((sessionInfo: PTYSessionInfo, rawData: string) => {
          if (sessionInfo.id === session.id) {
            rawDataTotal += rawData
            if (rawDataTotal.includes('test output')) {
              resolve(rawDataTotal)
            }
          }
        })
      })

      manager.write(session.id, 'echo "test output"\nexit\n')

      await rawDataPromise

      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${session.id}`
      )
      expect(response.status).toBe(200)

      const sessionData = await response.json()
      expect(sessionData.id).toBe(session.id)
      expect(sessionData.command).toBe('bash')
      expect(sessionData.args).toEqual([])
    }, 200)

    it('should return 404 for non-existent session', async () => {
      const nonexistentId = crypto.randomUUID()
      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${nonexistentId}`
      )
      expect(response.status).toBe(404)
    }, 200)

    it('should handle input to session', async () => {
      const title = crypto.randomUUID()
      const sessionUpdatePromise = new Promise<PTYSessionInfo>((resolve) => {
        registerSessionUpdateCallback((sessionInfo: PTYSessionInfo) => {
          if (sessionInfo.title === title && sessionInfo.status === 'running') {
            resolve(sessionInfo)
          }
        })
      })
      // Create a session to test input
      const session = manager.spawn({
        title: title,
        command: 'cat',
        args: [],
        description: 'Test session',
        parentSessionId: 'test',
      })

      // Wait for PTY to start
      await sessionUpdatePromise

      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${session.id}/input`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'test input\n' }),
        }
      )

      // Should return success
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result).toHaveProperty('success', true)
    }, 200)

    it('should handle kill session', async () => {
      const title = crypto.randomUUID()
      const sessionRunningPromise = new Promise<PTYSessionInfo>((resolve) => {
        registerSessionUpdateCallback((sessionInfo: PTYSessionInfo) => {
          if (sessionInfo.title === title && sessionInfo.status === 'running') {
            resolve(sessionInfo)
          }
        })
      })
      const sessionExitedPromise = new Promise<PTYSessionInfo>((resolve) => {
        registerSessionUpdateCallback((sessionInfo: PTYSessionInfo) => {
          if (sessionInfo.title === title && sessionInfo.status === 'killed') {
            resolve(sessionInfo)
          }
        })
      })
      const session = manager.spawn({
        title: title,
        command: 'cat',
        args: [],
        description: 'Test session',
        parentSessionId: 'test',
      })

      // Wait for PTY to start
      await sessionRunningPromise

      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${session.id}`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.success).toBe(true)

      await sessionExitedPromise
    }, 1000)

    it('should return session output', async () => {
      const title = crypto.randomUUID()
      const sessionExitedPromise = new Promise<PTYSessionInfo>((resolve) => {
        registerSessionUpdateCallback((sessionInfo: PTYSessionInfo) => {
          if (sessionInfo.title === title && sessionInfo.status === 'exited') {
            resolve(sessionInfo)
          }
        })
      })
      // Create a session that produces output
      const session = manager.spawn({
        title,
        command: 'echo',
        args: ['line1\nline2\nline3'],
        description: 'Test session with output',
        parentSessionId: 'test-output',
      })

      // Wait a bit for output to be captured
      await sessionExitedPromise

      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${session.id}/buffer/raw`
      )
      expect(response.status).toBe(200)

      const bufferData = await response.json()
      expect(bufferData).toHaveProperty('raw')
      expect(bufferData).toHaveProperty('byteLength')
      expect(typeof bufferData.raw).toBe('string')
      expect(typeof bufferData.byteLength).toBe('number')
      expect(bufferData.raw.length).toBe(21)
      expect(bufferData.raw).toBe('line1\r\nline2\r\nline3\r\n')
    })

    it('should return index.html for non-existent endpoints', async () => {
      const response = await fetch(`${managedTestServer.server.server.url}/api/nonexistent`)
      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).toContain('<div id="root"></div>')
      expect(text).toContain('<!doctype html>')
    }, 200)
  })
})

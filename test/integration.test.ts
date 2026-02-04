import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { manager } from '../src/plugin/pty/manager.ts'
import { ManagedTestClient, ManagedTestServer } from './utils.ts'
import { PTYServer } from '../src/web/server/server.ts'
import type { WSMessageServerSessionUpdate } from '../src/web/shared/types.ts'
import type { PTYSessionInfo } from '../src/plugin/pty/types.ts'

describe('Web Server Integration', () => {
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

  describe('Full User Workflow', () => {
    it('should handle multiple concurrent sessions and clients', async () => {
      await using managedTestClient1 = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      await using managedTestClient2 = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )

      const title1 = crypto.randomUUID()
      const title2 = crypto.randomUUID()

      const session1ExitedPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient1.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === title1 && message.session.status === 'exited') {
            resolve(message)
          }
        })
      })

      const session2ExitedPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient2.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === title2 && message.session.status === 'exited') {
            resolve(message)
          }
        })
      })

      managedTestClient1.send({
        type: 'spawn',
        title: title1,
        command: 'echo',
        args: ['Session 1'],
        description: 'Multi-session test 1',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      managedTestClient2.send({
        type: 'spawn',
        title: title2,
        command: 'echo',
        args: ['Session 2'],
        description: 'Multi-session test 2',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      const [session1Exited, session2Exited] = await Promise.all([
        session1ExitedPromise,
        session2ExitedPromise,
      ])

      const response = await fetch(`${managedTestServer.server.server.url}/api/sessions`)
      const sessions = (await response.json()) as PTYSessionInfo[]
      expect(sessions.length).toBeGreaterThanOrEqual(2)

      const sessionIds = sessions.map((s) => s.id)
      expect(sessionIds).toContain(session1Exited.session.id)
      expect(sessionIds).toContain(session2Exited.session.id)
    })

    it('should handle error conditions gracefully', async () => {
      await using managedTestClient = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )

      const testSessionId = crypto.randomUUID()

      const sessionExitedPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === testSessionId && message.session.status === 'exited') {
            resolve(message)
          }
        })
      })

      const session = manager.spawn({
        title: testSessionId,
        command: 'echo',
        args: ['test'],
        description: 'Error test session',
        parentSessionId: managedTestServer.sessionId,
      })

      await sessionExitedPromise

      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${session.id}/input`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'test input\n' }),
        }
      )

      const result = await response.json()
      expect(result).toHaveProperty('success')

      const errorPromise = new Promise((resolve) => {
        managedTestClient.errorCallbacks.push((message) => {
          resolve(message)
        })
      })

      managedTestClient.ws.send('invalid json')

      await errorPromise
    })

    it('should handle input to sleeping session', async () => {
      await using managedTestClient = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )

      const testSessionId = crypto.randomUUID()

      const sessionRunningPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === testSessionId && message.session.status === 'running') {
            resolve(message)
          }
        })
      })

      const session = manager.spawn({
        title: testSessionId,
        command: 'sleep',
        args: ['10'],
        description: 'Sleep test session',
        parentSessionId: managedTestServer.sessionId,
      })

      await sessionRunningPromise

      const inputResponse = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${session.id}/input`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'input to sleeping process\n' }),
        }
      )

      const inputResult = await inputResponse.json()
      expect(inputResult).toHaveProperty('success')

      manager.kill(session.id)
    })
  })

  describe('Performance and Reliability', () => {
    it('should handle rapid API requests', async () => {
      const title = crypto.randomUUID()

      const session = manager.spawn({
        title,
        command: 'echo',
        args: ['performance test'],
        description: 'Performance test',
        parentSessionId: managedTestServer.sessionId,
      })

      const promises: Promise<Response>[] = []
      for (let i = 0; i < 10; i++) {
        promises.push(fetch(`${managedTestServer.server.server.url}/api/sessions/${session.id}`))
      }

      const responses = await Promise.all(promises)
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })
    })

    it('should cleanup properly on server stop', async () => {
      const ptyServer = await PTYServer.createServer()

      const sessionId = crypto.randomUUID()
      manager.spawn({
        title: sessionId,
        command: 'echo',
        args: ['cleanup test'],
        description: 'Cleanup test',
        parentSessionId: sessionId,
      })

      const ws = new WebSocket(ptyServer.getWsUrl()!)
      await new Promise((resolve) => {
        ws.onopen = resolve
      })

      ws.close()

      ptyServer[Symbol.dispose]()

      const response = await fetch(`${ptyServer.server.url}/api/sessions`).catch(() => null)
      expect(response).toBeNull()
    })
  })
})

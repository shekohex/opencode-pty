import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { ManagedTestClient, ManagedTestServer } from './utils.ts'
import type { WSMessageServerSessionUpdate } from '../src/web/shared/types.ts'
import type { PTYSessionInfo } from '../src/plugin/pty/types.ts'

describe('PTY Manager Integration', () => {
  let managedTestServer: ManagedTestServer
  let disposableStack: DisposableStack

  beforeAll(async () => {
    managedTestServer = await ManagedTestServer.create()
    disposableStack = new DisposableStack()
    disposableStack.use(managedTestServer)
  })

  afterAll(async () => {
    disposableStack.dispose()
  })

  describe('Output Broadcasting', () => {
    it('should broadcast raw output to subscribed WebSocket clients', async () => {
      await using managedTestClient = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      const title = crypto.randomUUID()
      const dataReceivedPromise = new Promise<string>((resolve) => {
        let dataTotal = ''
        managedTestClient.rawDataCallbacks.push((message) => {
          if (message.session.title !== title) return
          dataTotal += message.rawData
          if (dataTotal.includes('test output')) {
            resolve(dataTotal)
          }
        })
      })
      managedTestClient.send({
        type: 'spawn',
        title,
        command: 'echo',
        args: ['test output'],
        description: 'Test session',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      const rawData = await dataReceivedPromise

      expect(rawData).toContain('test output')
    })

    it('should not broadcast to unsubscribed clients', async () => {
      await using managedTestClient1 = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      await using managedTestClient2 = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      const title1 = crypto.randomUUID()
      const title2 = crypto.randomUUID()
      const dataReceivedPromise1 = new Promise<string>((resolve) => {
        let dataTotal = ''
        managedTestClient1.rawDataCallbacks.push((message) => {
          if (message.session.title !== title1) return
          dataTotal += message.rawData
          if (dataTotal.includes('output from session 1')) {
            resolve(dataTotal)
          }
        })
      })
      const dataReceivedPromise2 = new Promise<string>((resolve) => {
        let dataTotal = ''
        managedTestClient2.rawDataCallbacks.push((message) => {
          if (message.session.title !== title2) return
          dataTotal += message.rawData
          if (dataTotal.includes('output from session 2')) {
            resolve(dataTotal)
          }
        })
      })

      // Spawn and subscribe client 1 to session 1
      managedTestClient1.send({
        type: 'spawn',
        title: title1,
        command: 'echo',
        args: ['output from session 1'],
        description: 'Session 1',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      // Spawn and subscribe client 2 to session 2
      managedTestClient2.send({
        type: 'spawn',
        title: title2,
        command: 'echo',
        args: ['output from session 2'],
        description: 'Session 2',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      const rawData1 = await dataReceivedPromise1
      const rawData2 = await dataReceivedPromise2

      expect(rawData1).toContain('output from session 1')
      expect(rawData2).toContain('output from session 2')

      expect(rawData1).not.toContain('output from session 2')
      expect(rawData2).not.toContain('output from session 1')
    })
  })

  describe('Session Management Integration', () => {
    it('should provide session data in correct format', async () => {
      await using managedTestClient = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      const title = crypto.randomUUID()
      const sessionInfoPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === title && message.session.status === 'exited') {
            resolve(message)
          }
        })
      })

      let outputTotal = ''
      managedTestClient.rawDataCallbacks.push((message) => {
        if (message.session.title !== title) return
        outputTotal += message.rawData
      })

      // Spawn a session
      managedTestClient.send({
        type: 'spawn',
        title,
        command: 'node',
        args: ['-e', "console.log('test')"],
        description: 'Test Node.js session',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      const sessionInfo = await sessionInfoPromise

      const response = await fetch(`${managedTestServer.server.server.url}/api/sessions`)
      const sessions = (await response.json()) as PTYSessionInfo[]

      expect(Array.isArray(sessions)).toBe(true)
      expect(sessions.length).toBeGreaterThan(0)

      const testSession = sessions.find((s) => s.id === sessionInfo.session.id)
      expect(testSession).toBeDefined()
      if (!testSession) return
      expect(testSession.command).toBe('node')
      expect(testSession.args).toEqual(['-e', "console.log('test')"])
      expect(testSession.status).toBeDefined()
      expect(typeof testSession.pid).toBe('number')
      expect(testSession.lineCount).toBeGreaterThan(0)
      expect(outputTotal).toContain('test')
    })

    it('should handle session lifecycle correctly', async () => {
      await using managedTestClient = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      const title = crypto.randomUUID()
      const sessionExitedPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === title && message.session.status === 'exited') {
            resolve(message)
          }
        })
      })

      // Spawn a session
      managedTestClient.send({
        type: 'spawn',
        title,
        command: 'echo',
        args: ['lifecycle test'],
        description: 'Lifecycle test session',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })

      const sessionExited = await sessionExitedPromise

      expect(sessionExited.session.status).toBe('exited')
      expect(sessionExited.session.exitCode).toBe(0)

      // Verify via API
      const response = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${sessionExited.session.id}`
      )
      const sessionData = (await response.json()) as PTYSessionInfo

      expect(sessionData.status).toBe('exited')
      expect(sessionData.exitCode).toBe(0)
    })

    it('should support session cleanup via API', async () => {
      await using managedTestClient = await ManagedTestClient.create(
        managedTestServer.server.getWsUrl()
      )
      const title = crypto.randomUUID()
      const sessionKilledPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === title && message.session.status === 'killed') {
            resolve(message)
          }
        })
      })
      const sessionRunningPromise = new Promise<WSMessageServerSessionUpdate>((resolve) => {
        managedTestClient.sessionUpdateCallbacks.push((message) => {
          if (message.session.title === title && message.session.status === 'running') {
            resolve(message)
          }
        })
      })

      // Spawn a long-running session
      managedTestClient.send({
        type: 'spawn',
        title,
        command: 'sleep',
        args: ['10'],
        description: 'Kill test session',
        parentSessionId: managedTestServer.sessionId,
        subscribe: true,
      })
      const runningSession = await sessionRunningPromise

      // Kill it via API
      const killResponse = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${runningSession.session.id}`,
        {
          method: 'DELETE',
        }
      )
      expect(killResponse.status).toBe(200)

      await sessionKilledPromise

      const killResult = await killResponse.json()
      expect(killResult.success).toBe(true)

      // Check status
      const statusResponse = await fetch(
        `${managedTestServer.server.server.url}/api/sessions/${runningSession.session.id}`
      )
      const sessionData = await statusResponse.json()
      expect(sessionData.status).toBe('killed')
    })
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { ptySpawn } from '../src/plugin/pty/tools/spawn.ts'
import { manager, registerRawOutputCallback } from '../src/plugin/pty/manager.ts'
import { ManagedTestServer } from './utils.ts'

describe('ptySpawn Integration', () => {
  let managedTestServer: ManagedTestServer
  let disposableStack: DisposableStack

  beforeAll(async () => {
    managedTestServer = await ManagedTestServer.create()
    disposableStack = new DisposableStack()
    disposableStack.use(managedTestServer)
  })

  afterAll(() => {
    disposableStack.dispose()
    manager.clearAllSessions()
  })

  it('should spawn echo "Hello World" and capture output', async () => {
    const title = `test-${crypto.randomUUID()}`
    let receivedOutput = ''

    const outputPromise = new Promise<string>((resolve) => {
      registerRawOutputCallback((session, rawData) => {
        if (session.title !== title) return
        receivedOutput += rawData
        if (receivedOutput.includes('Hello World')) {
          resolve(receivedOutput)
        }
      })
      setTimeout(() => resolve(receivedOutput || 'Timeout'), 2000)
    })

    const result = await ptySpawn.execute(
      {
        command: 'echo',
        args: ['Hello World'],
        title,
        description: 'Integration test for echo',
      },
      {
        sessionID: 'test-parent-session',
        messageID: 'msg-1',
        agent: 'test-agent',
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
        directory: '/tmp',
        worktree: '/tmp',
      }
    )

    const resultText = typeof result === 'string' ? result : result.output
    expect(resultText).toContain('<pty_spawned>')
    expect(resultText).toContain('Command: echo Hello World')
    expect(resultText).toContain('Status: running')

    const sessionIdMatch = resultText.match(/ID: (.+)/)
    expect(sessionIdMatch).toBeTruthy()
    const sessionId = sessionIdMatch?.[1] ?? ''

    const rawOutput = await outputPromise
    expect(rawOutput).toContain('Hello World')

    manager.kill(sessionId, true)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { manager, registerRawOutputCallback } from '../src/plugin/pty/manager.ts'
import { ManagedTestServer } from './utils.ts'

describe('PTY Echo Behavior', () => {
  let managedTestServer: ManagedTestServer
  let disposableStack: DisposableStack
  beforeAll(async () => {
    managedTestServer = await ManagedTestServer.create()
    disposableStack = new DisposableStack()
    disposableStack.use(managedTestServer)
  })

  afterAll(() => {
    disposableStack.dispose()
  })

  it('should echo input characters in non-interactive bash session', async () => {
    const title = crypto.randomUUID()
    const promise = new Promise<string>((resolve) => {
      let receivedOutputs = ''
      // Subscribe to raw output events
      registerRawOutputCallback((session, rawData) => {
        if (session.title !== title) return
        receivedOutputs += rawData
        if (receivedOutputs.includes('Hello World')) {
          resolve(receivedOutputs)
        }
      })
      setTimeout(() => resolve('Timeout'), 1000)
    }).catch((e) => {
      console.error(e)
    })

    // Spawn interactive bash session
    const session = manager.spawn({
      title,
      command: 'echo',
      args: ['Hello World'],
      description: 'Echo test session',
      parentSessionId: 'test',
    })

    const allOutput = await promise

    // Clean up
    manager.kill(session.id, true)

    // Verify echo occurred
    expect(allOutput).toContain('Hello World')
  })

  it('should echo input characters in interactive bash session', async () => {
    const title = crypto.randomUUID()
    const promise = new Promise<string>((resolve) => {
      let receivedOutputs = ''
      // Subscribe to raw output events
      registerRawOutputCallback((session, rawData) => {
        if (session.title !== title) return
        receivedOutputs += rawData
        if (receivedOutputs.includes('Hello World')) {
          resolve(receivedOutputs)
        }
      })
      setTimeout(() => resolve('Timeout'), 1000)
    }).catch((e) => {
      console.error(e)
    })

    // Spawn interactive bash session
    const session = manager.spawn({
      title,
      command: 'bash',
      args: [],
      description: 'Echo test session',
      parentSessionId: 'test',
    })

    manager.write(session.id, 'echo "Hello World"\nexit\n')

    const allOutput = await promise

    // Clean up
    manager.kill(session.id, true)

    // Verify echo occurred
    expect(allOutput).toContain('Hello World')
  })
})

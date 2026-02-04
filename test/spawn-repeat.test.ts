import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  initManager,
  manager,
  rawOutputCallbacks,
  registerRawOutputCallback,
} from '../src/plugin/pty/manager.ts'
import { OpencodeClient } from '@opencode-ai/sdk'

describe('PTY Echo Behavior', () => {
  beforeEach(() => {
    initManager(new OpencodeClient())
  })

  afterEach(() => {
    // Clean up any sessions
    manager.clearAllSessions()
  })

  it('should receive initial data reproducibly', async () => {
    const start = Date.now()
    const maxRuntime = 4000
    let runnings = 1
    while (Date.now() - start < maxRuntime) {
      runnings++
      const { success, stderr } = Bun.spawnSync({
        cmd: [
          'bun',
          'test',
          'spawn-repeat.test.ts',
          '--test-name-pattern',
          'should receive initial data once',
        ],
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, SYNC_TESTS: '1' },
      })
      expect(success, `[TEST] Iteration ${runnings}, stderr: ${stderr}`).toBe(true)
    }
  })

  it.skipIf(!process.env.SYNC_TESTS)(
    'should receive initial data once',
    async () => {
      const title = crypto.randomUUID()
      // Subscribe to raw output events
      const promise = new Promise<string>((resolve) => {
        let rawDataTotal = ''
        registerRawOutputCallback((session, rawData) => {
          if (session.title !== title) return
          rawDataTotal += rawData
          if (rawData.includes('Hello World')) {
            resolve(rawDataTotal)
          }
        })
      }).catch((e) => {
        console.error(e)
      })

      // Spawn interactive bash session
      const session = manager.spawn({
        title: title,
        command: 'echo',
        args: ['Hello World'],
        description: 'Echo test session',
        parentSessionId: 'test',
      })

      const rawData = await promise

      // Clean up
      manager.kill(session.id, true)
      rawOutputCallbacks.length = 0

      // Verify echo occurred
      expect(rawData).toContain('Hello World')
    },
    1000
  )
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { OpencodeClient } from '@opencode-ai/sdk'
import {
  initManager,
  manager,
  rawOutputCallbacks,
  registerRawOutputCallback,
} from '../src/plugin/pty/manager.ts'
import type { Subprocess } from 'bun'

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback

  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

describe('PTY Echo Behavior', () => {
  beforeEach(() => {
    initManager(new OpencodeClient())
  })

  afterEach(() => {
    // Clean up any sessions
    manager.clearAllSessions()
  })

  class TestSpawner {
    readonly subprocess: Subprocess<'ignore', 'pipe', 'pipe'>
    stderrOutput = ''
    stdoutOutput = ''
    readonly testNumber: number
    constructor(testNumber: number) {
      this.testNumber = testNumber
      this.subprocess = Bun.spawn({
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

      const { stdout, stderr } = this.subprocess

      ;(async () => {
        const decoder = new TextDecoder()
        const reader = stderr.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            this.stderrOutput += decoder.decode(value, { stream: true })
            if (done) break
          }
          this.stderrOutput += decoder.decode() // Flush any remaining buffered data
        } finally {
          reader.releaseLock()
        }
      })()
      ;(async () => {
        const decoder = new TextDecoder()
        const reader = stdout.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            this.stdoutOutput += decoder.decode(value, { stream: true })
            if (done) break
          }
          this.stdoutOutput += decoder.decode() // Flush any remaining buffered data
        } finally {
          reader.releaseLock()
        }
      })()
    }
  }

  it('should receive initial data reproducibly', async () => {
    const repeatRuns = positiveIntFromEnv('SPAWN_REPEAT_RUNS', 64)
    const repeatConcurrency = Math.min(
      positiveIntFromEnv('SPAWN_REPEAT_CONCURRENCY', 8),
      repeatRuns
    )
    let errorMessage = ''
    let completedRuns = 0
    let failureCount = 0

    while (completedRuns < repeatRuns) {
      const batchSize = Math.min(repeatConcurrency, repeatRuns - completedRuns)
      const spawned = Array.from(
        { length: batchSize },
        (_, index) => new TestSpawner(completedRuns + index + 1)
      )

      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 20000)
      })
      const all = Promise.all(spawned.map((s) => s.subprocess.exited))
      await Promise.race([all, timeout])

      const stillRunning = spawned.filter((s) => s.subprocess.exitCode === null)
      if (stillRunning.length > 0) {
        failureCount += stillRunning.length
        errorMessage += `[TEST] Timeout reached after 20s with ${stillRunning.length} subprocesses still running.\n`
        stillRunning.forEach((s) => {
          errorMessage += `[TEST] Subprocess ${s.testNumber} stderr: ${s.stderrOutput}\n`
          errorMessage += `[TEST] Subprocess ${s.testNumber} stdout: ${s.stdoutOutput}\n`
          s.subprocess.kill()
        })
      }

      const exitCodeNonZero = spawned.filter(
        (s) => s.subprocess.exitCode !== null && s.subprocess.exitCode !== 0
      )
      if (exitCodeNonZero.length > 0) {
        failureCount += exitCodeNonZero.length
        errorMessage += `[TEST] ${exitCodeNonZero.length} subprocesses exited with non-zero exit code.\n`
        exitCodeNonZero.forEach((s) => {
          errorMessage += `[TEST] Subprocess ${s.testNumber} stderr: ${s.stderrOutput}\n`
          errorMessage += `[TEST] Subprocess ${s.testNumber} stdout: ${s.stdoutOutput}\n`
        })
      }

      completedRuns += batchSize
    }

    errorMessage = `[TEST] Spawned ${completedRuns} subprocesses with concurrency ${repeatConcurrency}.\n${errorMessage}`
    expect(failureCount, errorMessage).toBe(0)
  }, 60000)

  it.skipIf(!process.env.SYNC_TESTS)(
    'should receive initial data once',
    async () => {
      const title = crypto.randomUUID()
      // Subscribe to raw output events
      const promise = new Promise<string>((resolve, reject) => {
        let rawDataTotal = ''
        registerRawOutputCallback((session, rawData) => {
          // console.log(`[TEST] Received raw data for session ${session.id} (${session.title}): ${rawData}`)
          if (session.title !== title) return
          rawDataTotal += rawData
          if (rawData.includes('Hello World')) {
            resolve(rawDataTotal)
          }
        })
        setTimeout(() => {
          reject(new Error(`Timeout waiting for Hello World, received: ${rawDataTotal}`))
        }, 10000)
      })

      // Spawn interactive bash session
      const session = manager.spawn({
        title: title,
        command: 'echo',
        args: ['Hello World'],
        description: 'Echo test session',
        parentSessionId: 'test',
      })

      // await Promise.resolve() // Yield to allow session to be fully registered and callbacks to be set up
      const rawData = await promise
      expect(rawData).toContain('Hello World')

      // Clean up
      manager.kill(session.id, true)
      rawOutputCallbacks.length = 0

      // Verify echo occurred
      expect(rawData).toContain('Hello World')
    },
    10000
  )
})

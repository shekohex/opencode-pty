import { expect, it, mock, spyOn } from 'bun:test'
import { SessionLifecycleManager } from '../src/plugin/pty/session-lifecycle.ts'

it('releases the native PTY on natural exit without duplicating the exit callback', async () => {
  const manager = new SessionLifecycleManager()
  const { promise: exited, resolve } = Promise.withResolvers<void>()
  const onExit = mock(() => resolve())
  const info = manager.spawn(
    { command: 'sh', args: ['-c', 'exit 3'], parentSessionId: 'test-session' },
    () => {},
    onExit
  )
  const session = manager.getSession(info.id)
  if (!session?.process) throw new Error('Expected a spawned PTY process')
  const kill = spyOn(session.process, 'kill')
  await exited
  expect(kill).toHaveBeenCalledTimes(1)
  expect(session.status).toBe('exited')
  expect(session.exitCode).toBe(3)
  expect(onExit).toHaveBeenCalledTimes(1)
})

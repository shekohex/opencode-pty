import { expect, it } from 'bun:test'
import { createRequire } from 'node:module'
import { SessionMessage } from '@opencode/schema/session-message'
import { RingBuffer } from '../src/plugin/pty/buffer.ts'
import type { PTYSession } from '../src/plugin/pty/types.ts'
import { V2SessionNotifier } from '../src/v2/notifier.ts'

it('reuses a valid message id for repeated notifications of one PTY session', async () => {
  const requireFromSchema = createRequire(import.meta.resolve('@opencode/schema/session-message'))
  const { Schema } = (await import(requireFromSchema.resolve('effect'))) as typeof import('effect')
  const generated = SessionMessage.ID.create()
  expect(Schema.decodeUnknownSync(SessionMessage.ID)(generated)).toBe(generated)

  const ids: unknown[] = []
  const notifier = new V2SessionNotifier({
    prompt: async ({ id }) => {
      ids.push(id)
      Schema.decodeUnknownSync(SessionMessage.ID)(id)
      return {} as never
    },
  })
  const session: PTYSession = {
    id: 'pty_test',
    title: 'Test session',
    command: 'echo',
    args: [],
    workdir: '.',
    status: 'exited',
    pid: 1,
    createdAt: new Date(),
    parentSessionId: 'ses_parent',
    notifyOnExit: true,
    timedOut: false,
    buffer: new RingBuffer(),
    process: null,
  }

  await Promise.all([
    notifier.sendExitNotification(session, 0),
    notifier.sendExitNotification(session, 0),
  ])

  expect(ids).toHaveLength(2)
  const id = Schema.decodeUnknownSync(SessionMessage.ID)(ids[0])
  expect(ids[1]).toBe(id)
})

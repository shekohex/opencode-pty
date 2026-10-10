import { afterAll, afterEach, describe, expect, it } from 'bun:test'
import { manager } from '../src/plugin/pty/manager.ts'
import { buildExitNotification } from '../src/plugin/pty/notification-manager.ts'
import { ptyRead } from '../src/plugin/pty/tools/read.ts'

// End-to-end: a real PTY process writes colours, a window title, line erases
// and carriage returns. On Windows, ConPTY additionally prefixes its own mode,
// clear-screen and title sequences, so this also exercises the preamble.
const CHILD_OUTPUT =
  '\x1b]0;child title\x07' +
  '\x1b[31merror:\x1b[0m boom\r\n' +
  '\x1b[2K\x1b[1Gprogress 100%\r\n' +
  '\x1b[32mdone\x1b[0m\x1b[K\r\n'

// Any C0/C1 control character other than tab and newline.
// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting their absence
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/

const ctx = {
  sessionID: 'parent',
  messageID: 'msg',
  agent: 'agent',
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
  directory: process.cwd(),
  worktree: process.cwd(),
}

async function readTool(args: { id: string; pattern?: string }): Promise<string> {
  const result = await ptyRead.execute(args, ctx)
  return typeof result === 'string' ? result : result.output
}

/** Spawns the child through the manager and resolves with the notification text on exit. */
async function runChild(): Promise<{ id: string; notification: string }> {
  const exited = new Promise<string>((resolve) => {
    manager.setNotifier({
      sendExitNotification: (session, exitCode) => {
        resolve(buildExitNotification(session, exitCode))
      },
    })
  })
  const info = manager.spawn({
    // The current Bun binary exists on every platform the tests run on, unlike `echo`.
    command: process.execPath,
    args: ['-e', 'process.stdout.write(process.env.PTY_TEST_OUTPUT)'],
    env: { PTY_TEST_OUTPUT: CHILD_OUTPUT },
    description: 'sanitize e2e',
    parentSessionId: 'parent',
    notifyOnExit: true,
  })
  const notification = await Promise.race([
    exited,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PTY child did not exit')), 10000)
    ),
  ])
  return { id: info.id, notification }
}

describe('PTY output sanitization (real PTY)', () => {
  const original = process.env.PTY_SANITIZE_OUTPUT

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PTY_SANITIZE_OUTPUT
    } else {
      process.env.PTY_SANITIZE_OUTPUT = original
    }
  })

  afterAll(() => {
    manager.setNotifier(null)
    manager.clearAllSessions()
  })

  it('strips control sequences from pty_read, search and <pty_exited>', async () => {
    delete process.env.PTY_SANITIZE_OUTPUT
    const { id, notification } = await runChild()

    try {
      // The raw buffer (used by the Web UI) keeps the terminal output.
      expect(manager.getRawBuffer(id)?.raw).toContain('\x1b[')

      const read = await readTool({ id })
      expect(read).not.toMatch(CONTROL_CHARACTER)
      expect(read).toContain('| error: boom\n')
      expect(read).toContain('| progress 100%\n')
      expect(read).toContain('| done\n')

      const search = await readTool({ id, pattern: '^error: boom$' })
      expect(search).not.toMatch(CONTROL_CHARACTER)
      expect(search).toContain('| error: boom\n')
      expect(search).toContain('(1 match from')

      expect(notification).not.toMatch(CONTROL_CHARACTER)
      expect(notification).toContain('Exit Code: 0\n')
      expect(notification).toContain('Last Line: done\n')
    } finally {
      manager.kill(id, true)
    }
  })

  it('returns raw output when PTY_SANITIZE_OUTPUT=0', async () => {
    process.env.PTY_SANITIZE_OUTPUT = '0'
    const { id } = await runChild()

    try {
      expect(await readTool({ id })).toContain('\x1b[')
    } finally {
      manager.kill(id, true)
    }
  })
})

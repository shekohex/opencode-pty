import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import { manager } from '../src/plugin/pty/manager.ts'
import { initPermissions } from '../src/plugin/pty/permissions.ts'
import type { PTYSessionInfo } from '../src/plugin/pty/types.ts'
import { createSession } from '../src/web/server/handlers/sessions.ts'
import { handleWebSocketMessage } from '../src/web/server/handlers/websocket.ts'
import type { WSMessageServerError } from '../src/web/shared/types.ts'

type TestPermissionConfig = {
  bash?: 'allow' | 'ask' | 'deny' | Record<string, 'allow' | 'ask' | 'deny'>
  external_directory?: 'allow' | 'ask' | 'deny'
}

function initTestPermissions(permission: TestPermissionConfig = {}) {
  initPermissions(
    {
      config: {
        get: async () => ({ data: { permission } }),
      },
      tui: {
        showToast: async () => {},
      },
    } as unknown as Parameters<typeof initPermissions>[0],
    process.cwd()
  )
}

function buildSpawnInfo(overrides: Partial<PTYSessionInfo> = {}): PTYSessionInfo {
  return {
    id: 'pty_denied_test',
    title: 'Denied test',
    command: 'echo',
    args: ['blocked'],
    workdir: process.cwd(),
    status: 'running',
    notifyOnExit: false,
    timedOut: false,
    pid: 1234,
    createdAt: new Date().toISOString(),
    lineCount: 0,
    ...overrides,
  }
}

function createFakeWebSocket(sentMessages: string[]): ServerWebSocket<undefined> {
  return {
    send: (message: string) => {
      sentMessages.push(message)
      return 0
    },
    subscribe: () => {},
    unsubscribe: () => {},
    subscriptions: new Set<string>(),
  } as unknown as ServerWebSocket<undefined>
}

describe('web permission enforcement', () => {
  afterEach(() => {
    initTestPermissions()
    mock.restore()
  })

  it('rejects REST session creation when bash permissions deny commands', async () => {
    initTestPermissions({ bash: 'deny' })
    const spawnSpy = spyOn(manager, 'spawn').mockReturnValue(buildSpawnInfo())

    const response = await createSession(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'echo',
          args: ['blocked'],
          description: 'Denied REST session',
        }),
      })
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('All bash commands are disabled')
    expect(spawnSpy).not.toHaveBeenCalled()
  })

  it('rejects WebSocket session creation when bash permissions deny commands', async () => {
    initTestPermissions({ bash: 'deny' })
    const spawnSpy = spyOn(manager, 'spawn').mockReturnValue(buildSpawnInfo())
    const sentMessages: string[] = []

    handleWebSocketMessage(
      createFakeWebSocket(sentMessages),
      JSON.stringify({
        type: 'spawn',
        command: 'echo',
        args: ['blocked'],
        description: 'Denied WebSocket session',
        parentSessionId: 'websocket-test',
      })
    )
    await new Promise(setImmediate)

    expect(spawnSpy).not.toHaveBeenCalled()
    expect(sentMessages).toHaveLength(1)
    const message = JSON.parse(sentMessages[0] ?? '{}') as WSMessageServerError
    expect(message.type).toBe('error')
    expect(message.error.message).toContain('All bash commands are disabled')
  })
})

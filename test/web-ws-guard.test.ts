import { beforeAll, describe, expect, it } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import { manager } from '../src/plugin/pty/manager.ts'
import {
  handleWebSocketMessage,
  type WebSocketConnectionState,
} from '../src/web/server/handlers/websocket.ts'
import type { WSMessageServerError } from '../src/web/shared/types.ts'

function fakeWs(writable: boolean): {
  ws: ServerWebSocket<WebSocketConnectionState>
  sent: string[]
} {
  const sent: string[] = []
  const ws = {
    send: (message: string) => {
      sent.push(message)
      return 0
    },
    subscribe: () => {},
    unsubscribe: () => {},
    subscriptions: new Set<string>(),
    data: { writable },
  } as unknown as ServerWebSocket<WebSocketConnectionState>
  return { ws, sent }
}

describe('WebSocket write guard (non-loopback + auth disabled)', () => {
  let spawnedSessionId: string

  beforeAll(() => {
    // Seed a session the read-only client could subscribe to. This makes
    // sure the `input` rejection happens BEFORE we touch the manager.
    const session = manager.spawn({
      command: 'bash',
      args: ['-c', 'cat'],
      description: 'guard-test',
      parentSessionId: 'guard-test',
    })
    spawnedSessionId = session.id
  })

  it('rejects `input` messages with an error frame and does NOT call manager.write', () => {
    const { ws, sent } = fakeWs(false)
    let writeCalls = 0
    const originalWrite = manager.write.bind(manager)
    manager.write = ((id: string, data: string) => {
      writeCalls++
      return originalWrite(id, data)
    }) as typeof manager.write

    try {
      handleWebSocketMessage(
        ws,
        JSON.stringify({ type: 'input', sessionId: spawnedSessionId, data: 'echo pwned\n' })
      )
    } finally {
      manager.write = originalWrite
    }

    expect(writeCalls).toBe(0)
    expect(sent).toHaveLength(1)
    const err = JSON.parse(sent[0] ?? '{}') as WSMessageServerError
    expect(err.type).toBe('error')
    expect(err.error.message).toContain('PTY_WEB_PASSWORD')
  })

  it('rejects `spawn` messages with an error frame and does NOT call manager.spawn', () => {
    const { ws, sent } = fakeWs(false)
    let spawnCalls = 0
    const originalSpawn = manager.spawn.bind(manager)
    manager.spawn = ((opts) => {
      spawnCalls++
      return originalSpawn(opts)
    }) as typeof manager.spawn

    try {
      handleWebSocketMessage(
        ws,
        JSON.stringify({
          type: 'spawn',
          command: 'echo',
          args: ['pwned'],
          description: 'should-not-spawn',
          parentSessionId: 'guard-test',
        })
      )
    } finally {
      manager.spawn = originalSpawn
    }

    expect(spawnCalls).toBe(0)
    expect(sent).toHaveLength(1)
    const err = JSON.parse(sent[0] ?? '{}') as WSMessageServerError
    expect(err.type).toBe('error')
  })

  it('still allows `subscribe` / `session_list` / `readRaw` on a read-only socket', () => {
    const { ws, sent } = fakeWs(false)

    // `session_list` — should respond normally.
    handleWebSocketMessage(ws, JSON.stringify({ type: 'session_list' }))
    const first = JSON.parse(sent[0] ?? '{}') as { type: string }
    expect(first.type).toBe('session_list')

    // `subscribe` — should respond with `subscribed`, no error.
    handleWebSocketMessage(ws, JSON.stringify({ type: 'subscribe', sessionId: spawnedSessionId }))
    const second = JSON.parse(sent[1] ?? '{}') as { type: string }
    expect(second.type).toBe('subscribed')

    // `readRaw` — should respond with `readRawResponse`.
    handleWebSocketMessage(ws, JSON.stringify({ type: 'readRaw', sessionId: spawnedSessionId }))
    const third = JSON.parse(sent[2] ?? '{}') as { type: string }
    expect(third.type).toBe('readRawResponse')
  })

  it('allows `input` and `spawn` when the connection is writable', () => {
    const { ws, sent } = fakeWs(true)
    handleWebSocketMessage(
      ws,
      JSON.stringify({ type: 'input', sessionId: spawnedSessionId, data: 'hello\n' })
    )
    // No error frame — just no-op (the seeded session hasn't received anything yet)
    const messages = sent.map((s) => JSON.parse(s) as { type: string })
    expect(messages.every((m) => m.type !== 'error')).toBe(true)
  })
})

import { afterEach, beforeEach, expect, it, jest, mock } from 'bun:test'
import { connectSessionSocket } from '../src/web/client/hooks/session-socket.ts'
import { RETRY_DELAY } from '../src/web/shared/constants.ts'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  send = mock()
  constructor() {
    FakeWebSocket.instances.push(this)
  }
  close() {
    this.onclose?.()
  }
  open() {
    this.onopen?.()
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

const originalWebSocket = globalThis.WebSocket
let close: (() => void) | undefined
beforeEach(() => {
  jest.useFakeTimers()
  FakeWebSocket.instances = []
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
})
afterEach(() => {
  close?.()
  globalThis.WebSocket = originalWebSocket
  jest.useRealTimers()
})

it('reconnects and resubscribes after an unexpected close', () => {
  const onConnected = mock()
  close = connectSessionSocket('ws://localhost/ws', 'active', {
    onConnected,
    onSessionList: mock(),
  }).close
  FakeWebSocket.instances[0]?.open()
  FakeWebSocket.instances[0]?.close()
  expect(onConnected).toHaveBeenLastCalledWith(false)
  jest.advanceTimersByTime(RETRY_DELAY - 1)
  expect(FakeWebSocket.instances).toHaveLength(1)
  jest.advanceTimersByTime(1)
  expect(FakeWebSocket.instances).toHaveLength(2)
  FakeWebSocket.instances[1]?.open()
  expect(FakeWebSocket.instances[1]?.send).toHaveBeenCalledWith(
    JSON.stringify({ type: 'subscribe', sessionId: 'active' })
  )
})

it('ignores output from sessions and sockets that are no longer active', () => {
  const callbacks = {
    onConnected: mock(),
    onSessionList: mock(),
    onSnapshot: mock(),
    onRawData: mock(),
  }
  const previous = connectSessionSocket('ws://localhost/ws', 'previous', callbacks)
  const oldSocket = FakeWebSocket.instances[0]
  previous.close()
  close = connectSessionSocket('ws://localhost/ws', 'active', callbacks).close
  const socket = FakeWebSocket.instances[1]
  oldSocket?.message({ type: 'raw_data', session: { id: 'previous' }, rawData: 'late' })
  socket?.message({ type: 'subscribed', sessionId: 'previous', rawData: 'wrong snapshot' })
  socket?.message({ type: 'raw_data', session: { id: 'previous' }, rawData: 'wrong chunk' })
  socket?.message({ type: 'subscribed', sessionId: 'active', rawData: 'snapshot' })
  socket?.message({ type: 'raw_data', session: { id: 'active' }, rawData: 'chunk' })
  expect(callbacks.onRawData).toHaveBeenCalledTimes(1)
  expect(callbacks.onRawData).toHaveBeenCalledWith('chunk')
  expect(callbacks.onSnapshot).toHaveBeenCalledTimes(1)
  expect(callbacks.onSnapshot).toHaveBeenCalledWith('snapshot')
})

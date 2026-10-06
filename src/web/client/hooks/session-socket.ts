import { RETRY_DELAY } from '../../shared/constants.ts'
import type {
  PTYSessionInfo,
  WSMessageServerRawData,
  WSMessageServerSessionList,
  WSMessageServerSessionUpdate,
  WSMessageServerSubscribedSession,
} from '../../shared/types.ts'

export function connectSessionSocket(
  url: string,
  sessionId: string | undefined,
  callbacks: {
    onConnected: (connected: boolean) => void
    onSnapshot?: (snapshot: string) => void
    onRawData?: (rawData: string) => void
    onSessionList: (sessions: PTYSessionInfo[]) => void
    onSessionUpdate?: (session: PTYSessionInfo) => void
  }
) {
  let ws: WebSocket
  let retry: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const connect = () => {
    ws = new WebSocket(url)
    ws.onopen = () => {
      if (closed) return
      callbacks.onConnected(true)
      ws.send(JSON.stringify({ type: 'session_list' }))
      if (sessionId) ws.send(JSON.stringify({ type: 'subscribe', sessionId }))
    }
    ws.onmessage = (event) => {
      if (closed) return
      try {
        const data = JSON.parse(event.data) as
          | WSMessageServerSubscribedSession
          | WSMessageServerRawData
          | WSMessageServerSessionList
          | WSMessageServerSessionUpdate
        if (data.type === 'subscribed' && data.sessionId === sessionId) {
          callbacks.onSnapshot?.(data.rawData)
        } else if (data.type === 'raw_data' && data.session.id === sessionId) {
          callbacks.onRawData?.(data.rawData)
        } else if (data.type === 'session_list') {
          callbacks.onSessionList(data.sessions || [])
        } else if (data.type === 'session_update') {
          callbacks.onSessionUpdate?.(data.session)
        }
        // Ignore malformed messages without interrupting the stream.
      } catch {}
    }
    ws.onclose = () => {
      if (closed) return
      callbacks.onConnected(false)
      retry = setTimeout(connect, RETRY_DELAY)
    }
  }
  connect()

  return {
    sendInput(sessionId: string, data: string): boolean {
      if (ws.readyState !== WebSocket.OPEN) return false
      ws.send(JSON.stringify({ type: 'input', sessionId, data }))
      return true
    },
    close() {
      closed = true
      clearTimeout(retry)
      ws.close()
    },
  }
}

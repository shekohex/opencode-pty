import { useState, useEffect, useRef } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'
import type {
  WSMessageServer,
  WSMessageServerRawData,
  WSMessageServerSessionList,
  WSMessageServerSessionUpdate,
} from 'opencode-pty/web/shared/types'
import { RETRY_DELAY, SKIP_AUTOSELECT_KEY } from 'opencode-pty/web/shared/constants'

import { RouteBuilder } from 'opencode-pty/web/shared/route-builder'

interface UseWebSocketOptions {
  activeSession: PTYSessionInfo | null
  onRawData?: (rawData: string) => void
  onSessionList: (sessions: PTYSessionInfo[], autoSelected: PTYSessionInfo | null) => void
  onSessionUpdate?: (updatedSession: PTYSessionInfo) => void
}

export function useWebSocket({
  activeSession,
  onRawData,
  onSessionList,
  onSessionUpdate,
}: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const activeSessionRef = useRef<PTYSessionInfo | null>(null)

  // Keep ref in sync with activeSession
  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  // Connect to WebSocket on mount
  useEffect(() => {
    const ws = new WebSocket(
      `${RouteBuilder.websocket()}`.replace(/^\/ws/, `ws://${location.host}/ws`)
    )
    ws.onopen = () => {
      setConnected(true)
      // Request initial session list
      ws.send(JSON.stringify({ type: 'session_list' }))
      // Resubscribe to active session if exists
      if (activeSessionRef.current) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: activeSessionRef.current.id }))
      }
    }
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessageServer
        if (data.type === 'session_list') {
          const sessionListMsg = data as WSMessageServerSessionList
          const sessions = sessionListMsg.sessions || []
          // Auto-select first running session if none selected (skip in tests that need empty state)
          const shouldSkipAutoselect = localStorage.getItem(SKIP_AUTOSELECT_KEY) === 'true'
          let autoSelected: PTYSessionInfo | null = null
          if (sessions.length > 0 && !activeSession && !shouldSkipAutoselect) {
            const runningSession =
              sessions.find((s: PTYSessionInfo) => s.status === 'running') || null
            autoSelected = runningSession || sessions[0] || null
            if (autoSelected) {
              activeSessionRef.current = autoSelected
              // Subscribe to the auto-selected session for live updates
              const readyState = wsRef.current?.readyState

              if (readyState === WebSocket.OPEN && wsRef.current) {
                wsRef.current.send(
                  JSON.stringify({ type: 'subscribe', sessionId: autoSelected!.id })
                )
              } else {
                setTimeout(() => {
                  const retryReadyState = wsRef.current?.readyState
                  if (retryReadyState === WebSocket.OPEN && wsRef.current) {
                    wsRef.current.send(
                      JSON.stringify({ type: 'subscribe', sessionId: autoSelected!.id })
                    )
                  }
                }, RETRY_DELAY)
              }
            }
          }
          onSessionList(sessions, autoSelected)
        } else if (data.type === 'session_update') {
          const sessionUpdateMsg = data as WSMessageServerSessionUpdate
          onSessionUpdate?.(sessionUpdateMsg.session)
        } else if (data.type === 'raw_data') {
          const rawDataMsg = data as WSMessageServerRawData
          const isForActiveSession = rawDataMsg.session.id === activeSessionRef.current?.id
          if (isForActiveSession) {
            onRawData?.(rawDataMsg.rawData)
          }
        }
        // eslint-disable-next-line no-empty
      } catch {}
    }
    ws.onclose = () => {
      setConnected(false)
    }
    ws.onerror = () => {}
    wsRef.current = ws
    return () => {
      ws.close()
    }
  }, [activeSession, onRawData, onSessionList, onSessionUpdate])

  const subscribe = (sessionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', sessionId }))
    }
  }

  const subscribeWithRetry = (sessionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscribe(sessionId)
    } else {
      setTimeout(() => {
        subscribe(sessionId)
      }, RETRY_DELAY)
    }
  }

  const sendInput = (sessionId: string, data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', sessionId, data }))
    }
  }

  return { connected, subscribe, subscribeWithRetry, sendInput }
}

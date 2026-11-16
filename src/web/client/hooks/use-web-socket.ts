import { useState, useEffect, useRef } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'
import { SKIP_AUTOSELECT_KEY } from 'opencode-pty/web/shared/constants'
import { RouteBuilder } from 'opencode-pty/web/shared/route-builder'
import { connectSessionSocket } from './session-socket.ts'

interface UseWebSocketOptions {
  activeSession: PTYSessionInfo | null
  onSnapshot?: (snapshot: string) => void
  onRawData?: (rawData: string) => void
  onSessionList: (sessions: PTYSessionInfo[], autoSelected: PTYSessionInfo | null) => void
  onSessionUpdate?: (updatedSession: PTYSessionInfo) => void
}

export function useWebSocket({
  activeSession,
  onSnapshot,
  onRawData,
  onSessionList,
  onSessionUpdate,
}: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<ReturnType<typeof connectSessionSocket> | null>(null)
  const sessionId = activeSession?.id

  useEffect(() => {
    const socket = connectSessionSocket(
      RouteBuilder.websocket().replace(/^\/ws/, `ws://${location.host}/ws`),
      sessionId,
      {
        onConnected: setConnected,
        onSnapshot,
        onRawData,
        onSessionList: (sessions) => {
          const skipAutoselect = localStorage.getItem(SKIP_AUTOSELECT_KEY) === 'true'
          const autoSelected =
            !sessionId && !skipAutoselect
              ? sessions.find((s) => s.status === 'running') || sessions[0] || null
              : null
          onSessionList(sessions, autoSelected)
        },
        onSessionUpdate,
      }
    )
    socketRef.current = socket
    return () => {
      socketRef.current = null
      socket.close()
    }
  }, [sessionId, onSnapshot, onRawData, onSessionList, onSessionUpdate])

  const sendInput = (sessionId: string, data: string) =>
    socketRef.current?.sendInput(sessionId, data) ?? false

  return { connected, sendInput }
}

import { useState, useEffect, useCallback, useRef } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

import { useWebSocket } from '../hooks/use-web-socket.ts'
import { useSessionManager } from '../hooks/use-session-manager.ts'

import { Sidebar } from './sidebar.tsx'
import { RawTerminal } from './terminal-renderer.tsx'
import { api } from '../../shared/api-client.ts'

export function App() {
  const [sessions, setSessions] = useState<PTYSessionInfo[]>([])
  const [activeSession, setActiveSession] = useState<PTYSessionInfo | null>(null)
  const terminalRef = useRef<RawTerminal | null>(null)

  const [wsMessageCount, setWsMessageCount] = useState(0)
  const [sessionUpdateCount, setSessionUpdateCount] = useState(0)

  const { connected, sendInput } = useWebSocket({
    activeSession,
    onSnapshot: useCallback((snapshot: string) => {
      terminalRef.current?.reset(snapshot)
    }, []),
    onRawData: useCallback((rawData: string) => {
      terminalRef.current?.write(rawData)
      setWsMessageCount((prev) => prev + 1)
    }, []),
    onSessionList: useCallback(
      (newSessions: PTYSessionInfo[], autoSelected: PTYSessionInfo | null) => {
        setSessions(newSessions)
        if (autoSelected) setActiveSession(autoSelected)
      },
      []
    ),
    onSessionUpdate: useCallback((updatedSession: PTYSessionInfo) => {
      setSessionUpdateCount((prev) => prev + 1)
      setSessions((prevSessions) => {
        const existingIndex = prevSessions.findIndex((s) => s.id === updatedSession.id)
        if (existingIndex >= 0) {
          // Replace the existing session
          const newSessions = [...prevSessions]
          newSessions[existingIndex] = updatedSession
          return newSessions
        } else {
          // Add the new session to the list
          return [...prevSessions, updatedSession]
        }
      })
    }, []),
  })

  // Periodic session list sync every 10 seconds
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        setSessions(await api.sessions.list())
      } catch (error) {
        console.error('Failed to sync sessions', error)
      }
    }, 10000) // 10 seconds

    return () => clearInterval(syncInterval)
  }, [])

  const { handleSendInput, handleKillSession } = useSessionManager({
    activeSession,
    sendInput,
  })

  return (
    <div className="container" data-active-session={activeSession?.id}>
      <Sidebar
        sessions={sessions}
        activeSession={activeSession}
        onSessionClick={setActiveSession}
        connected={connected}
      />
      <div className="main">
        {activeSession ? (
          <>
            <div className="output-header">
              <div className="output-title">{activeSession.description ?? activeSession.title}</div>
              <button type="button" className="kill-btn" onClick={handleKillSession}>
                Kill Session
              </button>
            </div>
            <div className="output-container">
              <RawTerminal
                key={activeSession?.id}
                ref={terminalRef}
                onSendInput={handleSendInput}
                onInterrupt={handleKillSession}
                disabled={!activeSession || activeSession.status !== 'running'}
              />
            </div>
            <div className="debug-info" data-testid="debug-info">
              Debug: active: {activeSession?.id || 'none'}, WS raw_data: {wsMessageCount},
              session_updates: {sessionUpdateCount}
            </div>
          </>
        ) : (
          <div className="empty-state">Select a session from the sidebar to view its output</div>
        )}
      </div>
    </div>
  )
}

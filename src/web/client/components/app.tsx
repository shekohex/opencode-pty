import { useState, useEffect, useCallback } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

import { useWebSocket } from '../hooks/use-web-socket.ts'
import { useSessionManager } from '../hooks/use-session-manager.ts'

import { Sidebar } from './sidebar.tsx'
import { RawTerminal } from './terminal-renderer.tsx'
import { api } from '../../shared/api-client.ts'

export function App() {
  const [sessions, setSessions] = useState<PTYSessionInfo[]>([])
  const [activeSession, setActiveSession] = useState<PTYSessionInfo | null>(null)
  const [rawOutput, setRawOutput] = useState<string>('')

  const [connected, setConnected] = useState(false)
  const [wsMessageCount, setWsMessageCount] = useState(0)
  const [sessionUpdateCount, setSessionUpdateCount] = useState(0)

  const handleSessionRemoved = useCallback((sessionId: string) => {
    setSessions((prevSessions) => prevSessions.filter((session) => session.id !== sessionId))
    setActiveSession((current) => (current?.id === sessionId ? null : current))
  }, [])

  const {
    connected: wsConnected,
    subscribeWithRetry,
    sendInput,
  } = useWebSocket({
    activeSession,
    onRawData: useCallback((rawData: string) => {
      setRawOutput((prev) => {
        const newOutput = prev + rawData
        return newOutput
      })
      setWsMessageCount((prev) => prev + 1)
    }, []),
    onSessionList: useCallback(
      (newSessions: PTYSessionInfo[], autoSelected: PTYSessionInfo | null) => {
        setSessions(newSessions)
        if (!autoSelected) {
          return
        }
        setActiveSession(autoSelected)
        api.session.buffer
          .raw({ id: autoSelected.id })
          .then((data) => {
            setRawOutput(data.raw)
          })
          .catch((error) => {
            console.error('Failed to fetch initial raw buffer for auto-selected session', error)
          })
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
    onSessionRemoved: handleSessionRemoved,
  })

  // Update connected from wsConnected
  useEffect(() => {
    setConnected(wsConnected)
  }, [wsConnected])

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

  const {
    handleSessionClick,
    handleSendInput,
    handleKillSession,
    handleKillSessionById,
    handleRemoveSession,
    handleClearFinished,
  } = useSessionManager({
    activeSession,
    setActiveSession,
    subscribeWithRetry,
    sendInput,
    wsConnected,
    onRawOutputUpdate: useCallback((rawOutput: string) => {
      setRawOutput(rawOutput)
    }, []),
  })

  const removeSessionFromList = handleSessionRemoved

  const handleRemoveSessionClick = useCallback(
    async (session: PTYSessionInfo) => {
      const removed = await handleRemoveSession(session)
      if (removed) {
        removeSessionFromList(session.id)
      }
    },
    [handleRemoveSession, removeSessionFromList]
  )

  const handleClearFinishedClick = useCallback(async () => {
    const finishedSessions = sessions.filter(
      (session) => session.status !== 'running' && session.status !== 'killing'
    )
    const cleared = await handleClearFinished(finishedSessions)
    if (cleared) {
      setSessions((prevSessions) =>
        prevSessions.filter(
          (session) => session.status === 'running' || session.status === 'killing'
        )
      )
      setActiveSession((current) =>
        current && (current.status === 'running' || current.status === 'killing') ? current : null
      )
    }
  }, [sessions, handleClearFinished])

  const handleDownloadSession = useCallback(() => {
    if (!activeSession) {
      return
    }
    const blob = new Blob([rawOutput], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${activeSession.id}.log`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [activeSession, rawOutput])

  return (
    <div className="container" data-active-session={activeSession?.id}>
      <Sidebar
        sessions={sessions}
        activeSession={activeSession}
        onSessionClick={handleSessionClick}
        onKillSession={handleKillSessionById}
        onRemoveSession={handleRemoveSessionClick}
        onClearFinished={handleClearFinishedClick}
        connected={connected}
      />
      <div className="main">
        {activeSession ? (
          <>
            <div className="output-header">
              <div className="output-title">{activeSession.description ?? activeSession.title}</div>
              <div className="output-actions">
                <button
                  type="button"
                  className="download-btn"
                  onClick={handleDownloadSession}
                  disabled={rawOutput.length === 0}
                >
                  Download
                </button>
                {activeSession.status === 'running' ? (
                  <button type="button" className="kill-btn" onClick={handleKillSession}>
                    Kill Session
                  </button>
                ) : (
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => handleRemoveSessionClick(activeSession)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="output-container">
              <RawTerminal
                key={activeSession?.id}
                rawOutput={rawOutput}
                onSendInput={handleSendInput}
                onInterrupt={handleKillSession}
                disabled={!activeSession || activeSession.status !== 'running'}
              />
            </div>
            <div className="debug-info" data-testid="debug-info">
              Debug: {rawOutput.length} chars, active: {activeSession?.id || 'none'}, WS raw_data:{' '}
              {wsMessageCount}, session_updates: {sessionUpdateCount}
            </div>
          </>
        ) : (
          <div className="empty-state">Select a session from the sidebar to view its output</div>
        )}
      </div>
    </div>
  )
}

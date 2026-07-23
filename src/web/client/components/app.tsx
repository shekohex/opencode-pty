import { useState, useEffect, useCallback } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

import { useWebSocket } from '../hooks/use-web-socket.ts'
import { useSessionManager } from '../hooks/use-session-manager.ts'

import { Sidebar } from './sidebar.tsx'
import { RawTerminal } from './terminal-renderer.tsx'
import { api } from '../../shared/api-client.ts'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const AUTH_WARNING_DISMISSED_KEY = 'pty-auth-warning-dismissed'

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (LOOPBACK_HOSTS.has(normalized)) return true
  if (normalized.startsWith('::ffff:')) {
    return LOOPBACK_HOSTS.has(normalized.slice('::ffff:'.length))
  }
  return false
}

function useAuthStatus() {
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authUsername, setAuthUsername] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/health', { credentials: 'same-origin' })
        if (!response.ok) return
        const data = (await response.json()) as {
          authEnabled?: boolean
          authUsername?: string
        }
        if (cancelled) return
        setAuthEnabled(data.authEnabled === true)
        setAuthUsername(typeof data.authUsername === 'string' ? data.authUsername : '')
      } catch {
        // Network failure is fine; leave defaults so the UI stays usable.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { authEnabled, authUsername }
}

function useNonLoopback() {
  return useState(() => !isLoopbackHostname(window.location.hostname))[0]
}

function useDismissedAuthWarning() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(AUTH_WARNING_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(AUTH_WARNING_DISMISSED_KEY, '1')
    } catch {
      // Ignore quota / privacy-mode failures; the in-memory flag still hides it.
    }
  }, [])
  return { dismissed, dismiss }
}

export function App() {
  const [sessions, setSessions] = useState<PTYSessionInfo[]>([])
  const [activeSession, setActiveSession] = useState<PTYSessionInfo | null>(null)
  const [rawOutput, setRawOutput] = useState<string>('')

  const [connected, setConnected] = useState(false)
  const [wsMessageCount, setWsMessageCount] = useState(0)
  const [sessionUpdateCount, setSessionUpdateCount] = useState(0)
  const { authEnabled } = useAuthStatus()
  const nonLoopback = useNonLoopback()
  const { dismissed: authWarningDismissed, dismiss: dismissAuthWarning } = useDismissedAuthWarning()
  const showAuthWarning = nonLoopback && !authEnabled && !authWarningDismissed
  const killBlocked = nonLoopback && !authEnabled
  const inputBlocked = killBlocked

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

  const { handleSessionClick, handleSendInput, handleKillSession } = useSessionManager({
    activeSession,
    setActiveSession,
    subscribeWithRetry,
    sendInput,
    wsConnected,
    killBlocked,
    inputBlocked,
    onRawOutputUpdate: useCallback((rawOutput: string) => {
      setRawOutput(rawOutput)
    }, []),
  })

  return (
    <div className="container" data-active-session={activeSession?.id}>
      {showAuthWarning && (
        <output className="auth-warning" data-testid="auth-warning" aria-live="polite">
          <span className="auth-warning-icon" aria-hidden="true">
            ⚠
          </span>
          <span className="auth-warning-text">
            Auth disabled. Set <code>PTY_WEB_PASSWORD</code> to secure kill/cleanup.
          </span>
          <button
            type="button"
            className="auth-warning-dismiss"
            aria-label="Dismiss"
            onClick={dismissAuthWarning}
          >
            ×
          </button>
        </output>
      )}
      <Sidebar
        sessions={sessions}
        activeSession={activeSession}
        onSessionClick={handleSessionClick}
        connected={connected}
      />
      <div className="main">
        {activeSession ? (
          <>
            <div className="output-header">
              <div className="output-title">{activeSession.description ?? activeSession.title}</div>
              <button
                type="button"
                className="kill-btn"
                onClick={handleKillSession}
                disabled={killBlocked}
                title={
                  killBlocked
                    ? 'Killing sessions is disabled because HTTP Basic Auth is not configured and the UI is being accessed from a non-loopback host.'
                    : undefined
                }
              >
                Kill Session
              </button>
            </div>
            <div className="output-container">
              <RawTerminal
                key={activeSession?.id}
                rawOutput={rawOutput}
                onSendInput={handleSendInput}
                onInterrupt={handleKillSession}
                disabled={!activeSession || activeSession.status !== 'running'}
                readOnly={inputBlocked}
              />
            </div>
            {inputBlocked && (
              <output className="terminal-readonly-banner">
                Read-only — input is disabled because HTTP Basic Auth is not configured and the UI
                is being accessed from a non-loopback host. Selection, copy, and paste still work.
              </output>
            )}
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

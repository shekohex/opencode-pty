import { useCallback } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

import { api } from '../../shared/api-client'

interface UseSessionManagerOptions {
  activeSession: PTYSessionInfo | null
  setActiveSession: (session: PTYSessionInfo | null) => void
  subscribeWithRetry: (sessionId: string) => void
  sendInput?: (sessionId: string, data: string) => void
  wsConnected?: boolean
  onRawOutputUpdate?: (rawOutput: string) => void
}

function sessionLabel(session: PTYSessionInfo): string {
  return session.description ?? session.title
}

export function useSessionManager({
  activeSession,
  setActiveSession,
  subscribeWithRetry,
  sendInput,
  wsConnected,
  onRawOutputUpdate,
}: UseSessionManagerOptions) {
  const handleSessionClick = useCallback(
    async (session: PTYSessionInfo) => {
      try {
        // Validate session object first
        if (!session?.id) {
          return
        }
        setActiveSession(session)
        onRawOutputUpdate?.('')
        // Subscribe to this session for live updates
        subscribeWithRetry(session.id)

        try {
          // Fetch raw buffer data only (processed output endpoint removed)
          const rawData = await api.session.buffer
            .raw({ id: session.id })
            .catch(() => ({ raw: '' }))

          // Call callback with raw data
          onRawOutputUpdate?.(rawData.raw || '')
        } catch {
          onRawOutputUpdate?.('')
        }
      } catch {
        // Ensure UI remains stable
        onRawOutputUpdate?.('')
      }
    },
    [setActiveSession, subscribeWithRetry, onRawOutputUpdate]
  )

  const handleSendInput = useCallback(
    async (data: string) => {
      if (!data || !activeSession) {
        return
      }

      // Try WebSocket first if connected and available
      if (wsConnected && sendInput) {
        try {
          sendInput(activeSession.id, data)
          return
        } catch (error) {
          console.warn('WebSocket input failed, falling back to HTTP:', error)
        }
      }

      // HTTP fallback
      try {
        await api.session.input({ id: activeSession.id }, { data })
        // eslint-disable-next-line no-empty
      } catch {}
    },
    [activeSession, wsConnected, sendInput]
  )

  /**
   * Kills a running session. The session is retained (with its buffer) so the
   * transcript stays available; removing it is a human action in the web UI.
   */
  const handleKillSessionById = useCallback(async (session: PTYSessionInfo): Promise<boolean> => {
    if (!confirm(`Are you sure you want to kill session "${sessionLabel(session)}"?`)) {
      return false
    }

    try {
      await api.session.kill({ id: session.id })
      return true
    } catch (error) {
      console.error('Failed to kill session', error)
      return false
    }
  }, [])

  const handleKillSession = useCallback(async () => {
    if (!activeSession) {
      return
    }
    await handleKillSessionById(activeSession)
  }, [activeSession, handleKillSessionById])

  /**
   * Human-only: discards a finished session entirely (buffer freed, dropped
   * from the session list).
   */
  const handleRemoveSession = useCallback(async (session: PTYSessionInfo): Promise<boolean> => {
    if (
      !confirm(
        `Remove finished session "${sessionLabel(session)}"? Its output buffer will be discarded.`
      )
    ) {
      return false
    }

    try {
      await api.session.cleanup({ id: session.id })
      return true
    } catch (error) {
      console.error('Failed to remove session', error)
      return false
    }
  }, [])

  /**
   * Human-only: discards every finished session in one go.
   */
  const handleClearFinished = useCallback(
    async (finishedSessions: PTYSessionInfo[]): Promise<boolean> => {
      if (finishedSessions.length === 0) {
        return false
      }

      if (
        !confirm(
          `Remove ${finishedSessions.length} finished session(s)? Their output buffers will be discarded.`
        )
      ) {
        return false
      }

      const results = await Promise.allSettled(
        finishedSessions.map((session) => api.session.cleanup({ id: session.id }))
      )
      const failed = results.filter((result) => result.status === 'rejected')
      if (failed.length > 0) {
        console.error(`Failed to remove ${failed.length} finished session(s)`)
        return false
      }
      return true
    },
    []
  )

  return {
    handleSessionClick,
    handleSendInput,
    handleKillSession,
    handleKillSessionById,
    handleRemoveSession,
    handleClearFinished,
  }
}

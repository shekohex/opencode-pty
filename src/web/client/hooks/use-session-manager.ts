import { useCallback } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

import { api } from '../../shared/api-client'

interface UseSessionManagerOptions {
  activeSession: PTYSessionInfo | null
  setActiveSession: (session: PTYSessionInfo | null) => void
  subscribeWithRetry: (sessionId: string) => void
  sendInput?: (sessionId: string, data: string) => void
  wsConnected?: boolean
  /**
   * When true, kill operations are refused client-side. The server enforces
   * the same rule on the API (returning 403), so disabling the handler here
   * avoids a round-trip + an unfriendly error popup.
   */
  killBlocked?: boolean
  onRawOutputUpdate?: (rawOutput: string) => void
}

export function useSessionManager({
  activeSession,
  setActiveSession,
  subscribeWithRetry,
  sendInput,
  wsConnected,
  killBlocked = false,
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

  const handleKillSession = useCallback(async () => {
    if (!activeSession) {
      return
    }

    if (killBlocked) {
      alert(
        'Killing sessions is disabled. Configure PTY_WEB_PASSWORD on the server (and reload the page) to enable kill when accessing the UI from a non-loopback host.'
      )
      return
    }

    if (
      !confirm(
        `Are you sure you want to kill session "${activeSession.description ?? activeSession.title}"?`
      )
    ) {
      return
    }

    try {
      await api.session.kill({ id: activeSession.id })

      // eslint-disable-next-line no-empty
    } catch {}
  }, [activeSession, killBlocked])

  return {
    handleSessionClick,
    handleSendInput,
    handleKillSession,
  }
}

import { useCallback } from 'react'
import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

import { api } from '../../shared/api-client'

interface UseSessionManagerOptions {
  activeSession: PTYSessionInfo | null
  sendInput: (sessionId: string, data: string) => boolean
}

export function useSessionManager({ activeSession, sendInput }: UseSessionManagerOptions) {
  const handleSendInput = useCallback(
    async (data: string) => {
      // WebSocket first; HTTP while it is not open (e.g. reconnecting).
      if (!data || !activeSession || sendInput(activeSession.id, data)) {
        return
      }
      try {
        await api.session.input({ id: activeSession.id }, { data })
        // eslint-disable-next-line no-empty
      } catch {}
    },
    [activeSession, sendInput]
  )

  const handleKillSession = useCallback(async () => {
    if (!activeSession) {
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
  }, [activeSession])

  return {
    handleSendInput,
    handleKillSession,
  }
}

import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

interface SidebarProps {
  sessions: PTYSessionInfo[]
  activeSession: PTYSessionInfo | null
  onSessionClick: (session: PTYSessionInfo) => void
  onKillSession: (session: PTYSessionInfo) => void
  onRemoveSession: (session: PTYSessionInfo) => void
  onClearFinished: () => void
  connected: boolean
}

interface SessionSectionProps {
  title: string
  sessions: PTYSessionInfo[]
  emptyText: string
  activeSession: PTYSessionInfo | null
  onSessionClick: (session: PTYSessionInfo) => void
  onKillSession: (session: PTYSessionInfo) => void
  onRemoveSession: (session: PTYSessionInfo) => void
  action?: React.ReactNode
}

/** A session is "live" until its process has actually exited. */
function isLive(session: PTYSessionInfo): boolean {
  return session.status === 'running' || session.status === 'killing'
}

function sessionLabel(session: PTYSessionInfo): string {
  return session.description ?? session.title
}

function SessionItem({
  session,
  activeSession,
  onSessionClick,
  onKillSession,
  onRemoveSession,
}: {
  session: PTYSessionInfo
  activeSession: PTYSessionInfo | null
  onSessionClick: (session: PTYSessionInfo) => void
  onKillSession: (session: PTYSessionInfo) => void
  onRemoveSession: (session: PTYSessionInfo) => void
}) {
  const label = sessionLabel(session)
  const canKill = session.status === 'running'
  const isFinished = session.status === 'exited' || session.status === 'killed'

  return (
    <div className={`session-row ${isFinished ? 'finished' : ''}`}>
      <button
        type="button"
        className={`session-item ${activeSession?.id === session.id ? 'active' : ''}`}
        onClick={() => onSessionClick(session)}
      >
        <div className="session-title">{label}</div>
        <div className="session-info">
          <span>{session.command}</span>
          <span className={`status-badge status-${session.status}`}>{session.status}</span>
        </div>
        <div className="session-info" style={{ marginTop: '4px' }}>
          <span>PID: {session.pid}</span>
          <span>{session.lineCount} lines</span>
        </div>
      </button>
      <div className="session-actions">
        {canKill ? (
          <button
            type="button"
            className="session-action session-action-kill"
            title="Kill session"
            aria-label={`Kill session ${label}`}
            onClick={() => onKillSession(session)}
          >
            Kill
          </button>
        ) : null}
        {isFinished ? (
          <button
            type="button"
            className="session-action session-action-remove"
            title="Remove finished session"
            aria-label={`Remove finished session ${label}`}
            onClick={() => onRemoveSession(session)}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SessionSection({
  title,
  sessions,
  emptyText,
  activeSession,
  onSessionClick,
  onKillSession,
  onRemoveSession,
  action,
}: SessionSectionProps) {
  return (
    <section className="session-section">
      <div className="session-section-header">
        <span className="session-section-title">{title}</span>
        <span className="session-section-count">{sessions.length}</span>
        {action}
      </div>
      {sessions.length === 0 ? (
        <div className="session-section-empty">{emptyText}</div>
      ) : (
        sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            activeSession={activeSession}
            onSessionClick={onSessionClick}
            onKillSession={onKillSession}
            onRemoveSession={onRemoveSession}
          />
        ))
      )}
    </section>
  )
}

export function Sidebar({
  sessions,
  activeSession,
  onSessionClick,
  onKillSession,
  onRemoveSession,
  onClearFinished,
  connected,
}: SidebarProps) {
  const liveSessions = sessions.filter(isLive)
  const finishedSessions = sessions.filter((session) => !isLive(session))

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>PTY Sessions</h1>
      </div>
      <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
        {connected ? '● Connected' : '○ Disconnected'}
      </div>
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="session-empty">No active sessions</div>
        ) : (
          <>
            <SessionSection
              title="Running"
              sessions={liveSessions}
              emptyText="No running sessions"
              activeSession={activeSession}
              onSessionClick={onSessionClick}
              onKillSession={onKillSession}
              onRemoveSession={onRemoveSession}
            />
            <SessionSection
              title="Finished"
              sessions={finishedSessions}
              emptyText="No finished sessions"
              activeSession={activeSession}
              onSessionClick={onSessionClick}
              onKillSession={onKillSession}
              onRemoveSession={onRemoveSession}
              action={
                finishedSessions.length > 0 ? (
                  <button type="button" className="clear-finished-btn" onClick={onClearFinished}>
                    Clear finished
                  </button>
                ) : null
              }
            />
          </>
        )}
      </div>
    </div>
  )
}

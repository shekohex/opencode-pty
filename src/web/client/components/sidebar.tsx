import type { PTYSessionInfo } from 'opencode-pty/web/shared/types'

interface SidebarProps {
  sessions: PTYSessionInfo[]
  activeSession: PTYSessionInfo | null
  onSessionClick: (session: PTYSessionInfo) => void
  connected: boolean
}

export function Sidebar({ sessions, activeSession, onSessionClick, connected }: SidebarProps) {
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
          <div style={{ padding: '16px', color: '#8b949e', textAlign: 'center' }}>
            No active sessions
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${activeSession?.id === session.id ? 'active' : ''}`}
              onClick={() => onSessionClick(session)}
            >
              <div className="session-title">{session.description ?? session.title}</div>
              <div className="session-info">
                <span>{session.command}</span>
                <span className={`status-badge status-${session.status}`}>{session.status}</span>
              </div>
              <div className="session-info" style={{ marginTop: '4px' }}>
                <span>PID: {session.pid}</span>
                <span>{session.lineCount} lines</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

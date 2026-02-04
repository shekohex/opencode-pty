import { spawn, type IPty } from 'bun-pty'
import { RingBuffer } from './buffer.ts'
import type { PTYSession, PTYSessionInfo, SpawnOptions } from './types.ts'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from '../constants.ts'
import moment from 'moment'

const SESSION_ID_BYTE_LENGTH = 4

function generateId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTE_LENGTH)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `pty_${hex}`
}

export class SessionLifecycleManager {
  private sessions: Map<string, PTYSession> = new Map()

  private createSessionObject(opts: SpawnOptions): PTYSession {
    const id = generateId()
    const args = opts.args ?? []
    const workdir = opts.workdir ?? process.cwd()
    const title =
      opts.title ?? (`${opts.command} ${args.join(' ')}`.trim() || `Terminal ${id.slice(-4)}`)

    const buffer = new RingBuffer()
    return {
      id,
      title,
      description: opts.description,
      command: opts.command,
      args,
      workdir,
      env: opts.env,
      status: 'running',
      pid: 0, // will be set after spawn
      createdAt: moment(),
      parentSessionId: opts.parentSessionId,
      notifyOnExit: opts.notifyOnExit ?? false,
      buffer,
      process: null, // will be set
    }
  }

  private spawnProcess(session: PTYSession): void {
    const env = { ...process.env, ...session.env } as Record<string, string>
    const ptyProcess: IPty = spawn(session.command, session.args, {
      name: 'xterm-256color',
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      cwd: session.workdir,
      env,
    })
    session.process = ptyProcess
    session.pid = ptyProcess.pid
  }

  private setupEventHandlers(
    session: PTYSession,
    onData: (session: PTYSession, data: string) => void,
    onExit: (session: PTYSession, exitCode: number | null) => void
  ): void {
    session.process!.onData((data: string) => {
      session.buffer.append(data)
      onData(session, data)
    })

    session.process!.onExit(({ exitCode, signal }) => {
      // Flush any remaining incomplete line in the buffer
      session.buffer.flush()

      if (session.status === 'killing') {
        session.status = 'killed'
      } else {
        session.status = 'exited'
      }
      session.exitCode = exitCode
      session.exitSignal = signal
      onExit(session, exitCode)
    })
  }

  spawn(
    opts: SpawnOptions,
    onData: (session: PTYSession, data: string) => void,
    onExit: (session: PTYSession, exitCode: number | null) => void
  ): PTYSessionInfo {
    const session = this.createSessionObject(opts)
    this.spawnProcess(session)
    this.setupEventHandlers(session, onData, onExit)
    this.sessions.set(session.id, session)
    return this.toInfo(session)
  }

  kill(id: string, cleanup: boolean = false): boolean {
    const session = this.sessions.get(id)
    if (!session) {
      return false
    }

    if (session.status === 'running') {
      session.status = 'killing'
      try {
        session.process!.kill()
      } catch {
        // Ignore kill errors
      }
    }

    if (cleanup) {
      session.buffer.clear()
      this.sessions.delete(id)
    }

    return true
  }

  private clearAllSessionsInternal(): void {
    for (const id of [...this.sessions.keys()]) {
      this.kill(id, true)
    }
  }

  clearAllSessions(): void {
    this.clearAllSessionsInternal()
  }

  cleanupBySession(parentSessionId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.parentSessionId === parentSessionId) {
        this.kill(id, true)
      }
    }
  }

  getSession(id: string): PTYSession | null {
    return this.sessions.get(id) || null
  }

  listSessions(): PTYSession[] {
    return Array.from(this.sessions.values())
  }

  toInfo(session: PTYSession): PTYSessionInfo {
    return {
      id: session.id,
      title: session.title,
      description: session.description,
      command: session.command,
      args: session.args,
      workdir: session.workdir,
      status: session.status,
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
      pid: session.pid,
      createdAt: session.createdAt.toISOString(true),
      lineCount: session.buffer.length,
    }
  }
}

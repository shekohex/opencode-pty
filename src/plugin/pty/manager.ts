import type { PTYSessionInfo, SpawnOptions, ReadResult, SearchResult } from './types.ts'
import type { OpencodeClient } from '@opencode-ai/sdk'
import { SessionLifecycleManager } from './session-lifecycle.ts'
import { OutputManager } from './output-manager.ts'
import { NotificationManager } from './notification-manager.ts'
import { withSession } from './utils.ts'

// Monkey-patch bun-pty to fix race condition in _startReadLoop
// Temporary workaround until https://github.com/sursaone/bun-pty/pull/37 is merged
import { semver } from 'bun'
import { version as bunPtyVersion } from 'bun-pty/package.json'
import { Terminal } from 'bun-pty'

if (semver.order(bunPtyVersion, '0.4.8') > 0) {
  throw new Error(
    `bun-pty version ${bunPtyVersion} is too new for patching; remove the workaround.`
  )
}

const proto = Terminal.prototype as unknown as { _startReadLoop?: (...args: unknown[]) => unknown }

const original = proto._startReadLoop

if (typeof original === 'function') {
  proto._startReadLoop = async function (this: InstanceType<typeof Terminal>, ...args: unknown[]) {
    await new Promise((r) => setTimeout(r, 0))
    return original.apply(this, args)
  }
}

type SessionUpdateCallback = (session: PTYSessionInfo) => void

export const sessionUpdateCallbacks: SessionUpdateCallback[] = []

export function registerSessionUpdateCallback(callback: SessionUpdateCallback) {
  sessionUpdateCallbacks.push(callback)
}

export function removeSessionUpdateCallback(callback: SessionUpdateCallback) {
  const index = sessionUpdateCallbacks.indexOf(callback)
  if (index !== -1) {
    sessionUpdateCallbacks.splice(index, 1)
  }
}

function notifySessionUpdate(session: PTYSessionInfo) {
  for (const callback of sessionUpdateCallbacks) {
    try {
      callback(session)
    } catch {
      // Ignore callback errors
    }
  }
}

type RawOutputCallback = (session: PTYSessionInfo, rawData: string) => void

export const rawOutputCallbacks: RawOutputCallback[] = []

export function registerRawOutputCallback(callback: RawOutputCallback): void {
  rawOutputCallbacks.push(callback)
}

export function removeRawOutputCallback(callback: RawOutputCallback): void {
  const index = rawOutputCallbacks.indexOf(callback)
  if (index !== -1) {
    rawOutputCallbacks.splice(index, 1)
  }
}

function notifyRawOutput(session: PTYSessionInfo, rawData: string): void {
  for (const callback of rawOutputCallbacks) {
    try {
      callback(session, rawData)
    } catch {
      // Ignore callback errors
    }
  }
}

class PTYManager {
  private lifecycleManager = new SessionLifecycleManager()
  private outputManager = new OutputManager()
  private notificationManager = new NotificationManager()

  init(client: OpencodeClient): void {
    this.notificationManager.init(client)
  }

  clearAllSessions(): void {
    this.lifecycleManager.clearAllSessions()
  }

  spawn(opts: SpawnOptions): PTYSessionInfo {
    const session = this.lifecycleManager.spawn(
      opts,
      (session, data) => {
        notifyRawOutput(this.lifecycleManager.toInfo(session), data)
      },
      async (session, exitCode) => {
        notifySessionUpdate(this.lifecycleManager.toInfo(session))
        if (session && session.notifyOnExit) {
          await this.notificationManager.sendExitNotification(session, exitCode || 0)
        }
      }
    )
    notifySessionUpdate(session)
    return session
  }

  write(id: string, data: string): boolean {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.outputManager.write(session, data),
      false
    )
  }

  read(id: string, offset: number = 0, limit?: number): ReadResult | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.outputManager.read(session, offset, limit),
      null
    )
  }

  search(id: string, pattern: RegExp, offset: number = 0, limit?: number): SearchResult | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.outputManager.search(session, pattern, offset, limit),
      null
    )
  }

  list(): PTYSessionInfo[] {
    return this.lifecycleManager.listSessions().map((s) => this.lifecycleManager.toInfo(s))
  }

  get(id: string): PTYSessionInfo | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => this.lifecycleManager.toInfo(session),
      null
    )
  }

  getRawBuffer(id: string): { raw: string; byteLength: number } | null {
    return withSession(
      this.lifecycleManager,
      id,
      (session) => ({
        raw: session.buffer.readRaw(),
        byteLength: session.buffer.byteLength,
      }),
      null
    )
  }

  kill(id: string, cleanup: boolean = false): boolean {
    return this.lifecycleManager.kill(id, cleanup)
  }

  cleanupBySession(parentSessionId: string): void {
    this.lifecycleManager.cleanupBySession(parentSessionId)
  }
}

export const manager = new PTYManager()

export function initManager(opcClient: OpencodeClient): void {
  manager.init(opcClient)
}

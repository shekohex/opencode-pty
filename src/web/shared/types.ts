import type { PTYSessionInfo, PTYStatus, SpawnOptions } from '../../plugin/pty/types'

export type { PTYSessionInfo, PTYStatus, HealthResponse }

export class CustomError extends Error {
  constructor(message: string) {
    super(message)
  }

  override name = 'CustomError'
  prettyPrintColor: string = Bun.inspect(this, { colors: true, depth: 10 })
  prettyPrintNoColor: string = Bun.stripANSI(this.prettyPrintColor)

  toJSON() {
    const obj: Record<string, unknown> = {}
    // Include all own properties, including non-enumerable ones like 'message' and 'stack'
    // prettyPrintColor and prettyPrintNoColor are now included automatically as strings
    Object.getOwnPropertyNames(this).forEach((key) => {
      obj[key] = (this as Record<string, unknown>)[key]
    })
    return obj
  }
}

export interface WSMessageClient {
  type: 'subscribe' | 'unsubscribe' | 'session_list' | 'spawn' | 'input' | 'readRaw'
}

export interface WSMessageClientSubscribeSession extends WSMessageClient {
  type: 'subscribe'
  sessionId: string
}

export interface WSMessageClientUnsubscribeSession extends WSMessageClient {
  type: 'unsubscribe'
  sessionId: string
}

export interface WSMessageClientSessionList extends WSMessageClient {
  type: 'session_list'
}

export interface WSMessageClientSpawnSession extends WSMessageClient, SpawnOptions {
  type: 'spawn'
  subscribe?: boolean
}

export interface WSMessageClientInput extends WSMessageClient {
  type: 'input'
  sessionId: string
  data: string
}

export interface WSMessageClientReadRaw extends WSMessageClient {
  type: 'readRaw'
  sessionId: string
}

export interface WSMessageServer {
  type:
    | 'subscribed'
    | 'unsubscribed'
    | 'raw_data'
    | 'readRawResponse'
    | 'session_list'
    | 'session_update'
    | 'error'
}

export interface WSMessageServerSubscribedSession extends WSMessageServer {
  type: 'subscribed'
  sessionId: string
}

export interface WSMessageServerUnsubscribedSession extends WSMessageServer {
  type: 'unsubscribed'
  sessionId: string
}

export interface WSMessageServerRawData extends WSMessageServer {
  type: 'raw_data'
  session: PTYSessionInfo
  rawData: string
}

export interface WSMessageServerReadRawResponse extends WSMessageServer {
  type: 'readRawResponse'
  sessionId: string
  rawData: string
}

export interface WSMessageServerSessionList extends WSMessageServer {
  type: 'session_list'
  sessions: PTYSessionInfo[]
}

export interface WSMessageServerSessionUpdate extends WSMessageServer {
  type: 'session_update'
  session: PTYSessionInfo
}

export interface WSMessageServerError extends WSMessageServer {
  type: 'error'
  error: CustomError
}

interface HealthResponse {
  status: 'healthy'
  timestamp: string
  uptime: number
  sessions: { total: number; active: number }
  websocket: { connections: number }
  memory?: { rss: number; heapUsed: number; heapTotal: number }
  responseTime?: number
}

import type { ServerWebSocket } from 'bun'
import { manager } from '../../../plugin/pty/manager'
import { checkCommandPermission, checkWorkdirPermission } from '../../../plugin/pty/permissions'
import {
  type WSMessageServerSessionList,
  type WSMessageClientSubscribeSession,
  type WSMessageServerError,
  type WSMessageClientUnsubscribeSession,
  type WSMessageClientSessionList,
  type WSMessageClient,
  type WSMessageClientSpawnSession,
  type WSMessageClientInput,
  type WSMessageClientReadRaw,
  type WSMessageServerReadRawResponse,
  type WSMessageServerSubscribedSession,
  CustomError,
  type WSMessageServerUnsubscribedSession,
} from '../../shared/types'

/** Per-connection state attached at WebSocket upgrade time. */
export interface WebSocketConnectionState {
  /**
   * Whether this connection is allowed to push data into PTYs (via the
   * `input` message) or create new sessions (via `spawn`). Determined at
   * upgrade time from the auth gate + the request's Origin header.
   */
  writable: boolean
}

class WebSocketHandler {
  private sendSessionList(ws: ServerWebSocket<WebSocketConnectionState>): void {
    const sessions = manager.list()
    const message: WSMessageServerSessionList = { type: 'session_list', sessions }
    ws.send(JSON.stringify(message))
  }

  private handleSubscribe(
    ws: ServerWebSocket<WebSocketConnectionState>,
    message: WSMessageClientSubscribeSession
  ): void {
    const session = manager.get(message.sessionId)
    if (!session) {
      const error: WSMessageServerError = {
        type: 'error',
        error: new CustomError(`Session ${message.sessionId} not found`),
      }
      ws.send(JSON.stringify(error))
    } else {
      ws.subscribe(`session:${message.sessionId}`)
      const response: WSMessageServerSubscribedSession = {
        type: 'subscribed',
        sessionId: message.sessionId,
      }
      ws.send(JSON.stringify(response))
    }
  }

  private handleUnsubscribe(
    ws: ServerWebSocket<WebSocketConnectionState>,
    message: WSMessageClientUnsubscribeSession
  ): void {
    const topic = `session:${message.sessionId}`
    ws.unsubscribe(topic)
    const response: WSMessageServerUnsubscribedSession = {
      type: 'unsubscribed',
      sessionId: message.sessionId,
    }
    ws.send(JSON.stringify(response))
  }

  private handleSessionListRequest(
    ws: ServerWebSocket<WebSocketConnectionState>,
    _message: WSMessageClientSessionList
  ): void {
    this.sendSessionList(ws)
  }

  private handleUnknownMessage(
    ws: ServerWebSocket<WebSocketConnectionState>,
    message: WSMessageClient
  ): void {
    const error: WSMessageServerError = {
      type: 'error',
      error: new CustomError(`Unknown message type ${message.type}`),
    }
    ws.send(JSON.stringify(error))
  }

  public handleWebSocketMessage(
    ws: ServerWebSocket<WebSocketConnectionState>,
    data: string | Buffer<ArrayBuffer>
  ): void {
    if (typeof data !== 'string') {
      const error: WSMessageServerError = {
        type: 'error',
        error: new CustomError('Binary messages are not supported yet. File an issue.'),
      }
      ws.send(JSON.stringify(error))
      return
    }
    try {
      const message: WSMessageClient = JSON.parse(data)

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message as WSMessageClientSubscribeSession)
          break

        case 'unsubscribe':
          this.handleUnsubscribe(ws, message as WSMessageClientUnsubscribeSession)
          break

        case 'session_list':
          this.handleSessionListRequest(ws, message as WSMessageClientSessionList)
          break

        case 'spawn':
          if (!isWritable(ws)) {
            sendWriteError(ws)
            break
          }
          void this.handleSpawn(ws, message as WSMessageClientSpawnSession)
          break

        case 'input':
          if (!isWritable(ws)) {
            sendWriteError(ws)
            break
          }
          this.handleInput(message as WSMessageClientInput)
          break

        case 'readRaw':
          this.handleReadRaw(ws, message as WSMessageClientReadRaw)
          break

        default:
          this.handleUnknownMessage(ws, message)
      }
    } catch (err) {
      const error: WSMessageServerError = {
        type: 'error',
        error: new CustomError(Bun.inspect(err)),
      }
      ws.send(JSON.stringify(error))
    }
  }

  private async handleSpawn(
    ws: ServerWebSocket<WebSocketConnectionState>,
    message: WSMessageClientSpawnSession
  ) {
    try {
      await checkCommandPermission(message.command, message.args ?? [])
      if (message.workdir) {
        await checkWorkdirPermission(message.workdir)
      }

      const sessionInfo = manager.spawn(message)
      if (message.subscribe) {
        this.handleSubscribe(ws, { type: 'subscribe', sessionId: sessionInfo.id })
      }
    } catch (err) {
      const error: WSMessageServerError = {
        type: 'error',
        error: new CustomError(err instanceof Error ? err.message : Bun.inspect(err)),
      }
      ws.send(JSON.stringify(error))
    }
  }

  private handleInput(message: WSMessageClientInput) {
    manager.write(message.sessionId, message.data)
  }

  private handleReadRaw(
    ws: ServerWebSocket<WebSocketConnectionState>,
    message: WSMessageClientReadRaw
  ) {
    const rawData = manager.getRawBuffer(message.sessionId)
    if (!rawData) {
      const error: WSMessageServerError = {
        type: 'error',
        error: new CustomError(`Session ${message.sessionId} not found`),
      }
      ws.send(JSON.stringify(error))
      return
    }
    const response: WSMessageServerReadRawResponse = {
      type: 'readRawResponse',
      sessionId: message.sessionId,
      rawData: rawData.raw,
    }
    ws.send(JSON.stringify(response))
  }
}

export function handleWebSocketMessage(
  ws: ServerWebSocket<WebSocketConnectionState>,
  data: string | Buffer<ArrayBuffer>
): void {
  const handler = new WebSocketHandler()
  handler.handleWebSocketMessage(ws, data)
}

function isWritable(ws: ServerWebSocket<WebSocketConnectionState>): boolean {
  return ws.data?.writable === true
}

function sendWriteError(ws: ServerWebSocket<WebSocketConnectionState>): void {
  const error: WSMessageServerError = {
    type: 'error',
    error: new CustomError(
      'Writing to PTYs is disabled from this origin. Set PTY_WEB_PASSWORD on the server (and reload) to enable input and session creation.'
    ),
  }
  ws.send(JSON.stringify(error))
}

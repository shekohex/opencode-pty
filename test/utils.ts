import { OpencodeClient } from '@opencode-ai/sdk'
import {
  initManager,
  manager,
  sessionUpdateCallbacks,
  rawOutputCallbacks,
} from '../src/plugin/pty/manager'
import { PTYServer } from '../src/web/server/server'
import type {
  WSMessageServer,
  WSMessageServerSubscribedSession,
  WSMessageServerUnsubscribedSession,
  WSMessageServerSessionUpdate,
  WSMessageServerRawData,
  WSMessageServerReadRawResponse,
  WSMessageServerSessionList,
  WSMessageServerError,
  WSMessageClientInput,
  WSMessageClientSessionList,
  WSMessageClientSpawnSession,
  WSMessageClientSubscribeSession,
  WSMessageClientUnsubscribeSession,
} from '../src/web/shared/types'

export class ManagedTestClient implements Disposable {
  public readonly ws: WebSocket
  private readonly stack = new DisposableStack()

  public readonly messages: WSMessageServer[] = []
  public readonly subscribedCallbacks: Array<(message: WSMessageServerSubscribedSession) => void> =
    []
  public readonly unsubscribedCallbacks: Array<
    (message: WSMessageServerUnsubscribedSession) => void
  > = []
  public readonly sessionUpdateCallbacks: Array<(message: WSMessageServerSessionUpdate) => void> =
    []
  public readonly rawDataCallbacks: Array<(message: WSMessageServerRawData) => void> = []
  public readonly readRawResponseCallbacks: Array<
    (message: WSMessageServerReadRawResponse) => void
  > = []
  public readonly sessionListCallbacks: Array<(message: WSMessageServerSessionList) => void> = []
  public readonly errorCallbacks: Array<(message: WSMessageServerError) => void> = []

  private constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.ws.onerror = (error) => {
      throw error
    }
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WSMessageServer
      this.messages.push(message)
      switch (message.type) {
        case 'subscribed':
          this.subscribedCallbacks.forEach((callback) =>
            callback(message as WSMessageServerSubscribedSession)
          )
          break
        case 'unsubscribed':
          this.unsubscribedCallbacks.forEach((callback) =>
            callback(message as WSMessageServerUnsubscribedSession)
          )
          break
        case 'session_update':
          this.sessionUpdateCallbacks.forEach((callback) =>
            callback(message as WSMessageServerSessionUpdate)
          )
          break
        case 'raw_data':
          this.rawDataCallbacks.forEach((callback) => callback(message as WSMessageServerRawData))
          break
        case 'readRawResponse':
          this.readRawResponseCallbacks.forEach((callback) =>
            callback(message as WSMessageServerReadRawResponse)
          )
          break
        case 'session_list':
          this.sessionListCallbacks.forEach((callback) =>
            callback(message as WSMessageServerSessionList)
          )
          break
        case 'error':
          this.errorCallbacks.forEach((callback) => callback(message as WSMessageServerError))
          break
      }
    }
  }
  [Symbol.dispose]() {
    this.ws.close()
    this.stack.dispose()
  }
  /**
   * Waits until the WebSocket connection is open.
   *
   * The onopen event is broken so we need to wait manually.
   * Problem: if onopen is set after the WebSocket is opened,
   * it will never be called. So we wait here until the readyState is OPEN.
   * This prevents flakiness.
   */
  public async waitOpen() {
    while (this.ws.readyState !== WebSocket.OPEN) {
      await new Promise(setImmediate)
    }
  }
  public static async create(wsUrl: string) {
    const client = new ManagedTestClient(wsUrl)
    await client.waitOpen()
    return client
  }

  /**
   * Verify that a specific character appears in raw_data events within timeout
   */
  async verifyCharacterInEvents(
    sessionId: string,
    chars: string,
    timeout = 5000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false)
      }, timeout)

      let rawData = ''
      this.rawDataCallbacks.push((message) => {
        if (message.session.id !== sessionId) return
        rawData += message.rawData
        if (rawData.includes(chars)) {
          clearTimeout(timeoutId)
          resolve(true)
        }
      })
    })
  }

  public send(
    message:
      | WSMessageClientInput
      | WSMessageClientSessionList
      | WSMessageClientSpawnSession
      | WSMessageClientSubscribeSession
      | WSMessageClientUnsubscribeSession
  ) {
    this.ws.send(JSON.stringify(message))
  }
}

export class ManagedTestServer implements Disposable {
  public readonly server: PTYServer
  private readonly stack = new DisposableStack()
  public readonly sessionId: string

  public static async create() {
    const server = await PTYServer.createServer()

    return new ManagedTestServer(server)
  }

  private constructor(server: PTYServer) {
    const client = new OpencodeClient()
    initManager(client)
    this.server = server
    this.stack.use(this.server)
    this.sessionId = crypto.randomUUID()
  }
  [Symbol.dispose]() {
    this.stack.dispose()
    manager.clearAllSessions()
    sessionUpdateCallbacks.length = 0
    rawOutputCallbacks.length = 0
  }
}

import { manager } from '../../../plugin/pty/manager';
import { checkCommandPermission, checkWorkdirPermission } from '../../../plugin/pty/permissions';
import { CustomError, } from '../../shared/types';
class WebSocketHandler {
    sendSessionList(ws) {
        const sessions = manager.list();
        const message = { type: 'session_list', sessions };
        ws.send(JSON.stringify(message));
    }
    handleSubscribe(ws, message) {
        const session = manager.get(message.sessionId);
        if (!session) {
            const error = {
                type: 'error',
                error: new CustomError(`Session ${message.sessionId} not found`),
            };
            ws.send(JSON.stringify(error));
        }
        else {
            ws.subscribe(`session:${message.sessionId}`);
            const response = {
                type: 'subscribed',
                sessionId: message.sessionId,
                rawData: manager.getRawBuffer(message.sessionId)?.raw ?? '',
            };
            ws.send(JSON.stringify(response));
        }
    }
    handleUnsubscribe(ws, message) {
        const topic = `session:${message.sessionId}`;
        ws.unsubscribe(topic);
        const response = {
            type: 'unsubscribed',
            sessionId: message.sessionId,
        };
        ws.send(JSON.stringify(response));
    }
    handleSessionListRequest(ws, _message) {
        this.sendSessionList(ws);
    }
    handleUnknownMessage(ws, message) {
        const error = {
            type: 'error',
            error: new CustomError(`Unknown message type ${message.type}`),
        };
        ws.send(JSON.stringify(error));
    }
    handleWebSocketMessage(ws, data) {
        if (typeof data !== 'string') {
            const error = {
                type: 'error',
                error: new CustomError('Binary messages are not supported yet. File an issue.'),
            };
            ws.send(JSON.stringify(error));
            return;
        }
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case 'subscribe':
                    this.handleSubscribe(ws, message);
                    break;
                case 'unsubscribe':
                    this.handleUnsubscribe(ws, message);
                    break;
                case 'session_list':
                    this.handleSessionListRequest(ws, message);
                    break;
                case 'spawn':
                    void this.handleSpawn(ws, message);
                    break;
                case 'input':
                    this.handleInput(message);
                    break;
                case 'readRaw':
                    this.handleReadRaw(ws, message);
                    break;
                default:
                    this.handleUnknownMessage(ws, message);
            }
        }
        catch (err) {
            const error = {
                type: 'error',
                error: new CustomError(Bun.inspect(err)),
            };
            ws.send(JSON.stringify(error));
        }
    }
    async handleSpawn(ws, message) {
        try {
            await checkCommandPermission(message.command, message.args ?? []);
            if (message.workdir) {
                await checkWorkdirPermission(message.workdir);
            }
            const sessionInfo = manager.spawn(message);
            if (message.subscribe) {
                this.handleSubscribe(ws, { type: 'subscribe', sessionId: sessionInfo.id });
            }
        }
        catch (err) {
            const error = {
                type: 'error',
                error: new CustomError(err instanceof Error ? err.message : Bun.inspect(err)),
            };
            ws.send(JSON.stringify(error));
        }
    }
    handleInput(message) {
        manager.write(message.sessionId, message.data);
    }
    handleReadRaw(ws, message) {
        const rawData = manager.getRawBuffer(message.sessionId);
        if (!rawData) {
            const error = {
                type: 'error',
                error: new CustomError(`Session ${message.sessionId} not found`),
            };
            ws.send(JSON.stringify(error));
            return;
        }
        const response = {
            type: 'readRawResponse',
            sessionId: message.sessionId,
            rawData: rawData.raw,
        };
        ws.send(JSON.stringify(response));
    }
}
export function handleWebSocketMessage(ws, data) {
    const handler = new WebSocketHandler();
    handler.handleWebSocketMessage(ws, data);
}
//# sourceMappingURL=websocket.js.map
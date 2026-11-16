import { NOTIFICATION_LINE_TRUNCATE, NOTIFICATION_TITLE_TRUNCATE } from "../constants.js";
export class NotificationManager {
    client = null;
    init(client) {
        this.client = client;
    }
    async sendExitNotification(session, exitCode) {
        if (!this.client) {
            return;
        }
        try {
            const message = buildExitNotification(session, exitCode);
            let modelContext = {};
            try {
                const parent = await this.client.session.get({
                    path: { id: session.parentSessionId },
                });
                const model = parent.data?.model;
                if (model) {
                    modelContext = {
                        model: { providerID: model.providerID, modelID: model.id },
                        ...(model.variant ? { variant: model.variant } : {}),
                    };
                }
            }
            catch {
                // Older OpenCode versions may not expose the session model.
            }
            await this.client.session.promptAsync({
                path: { id: session.parentSessionId },
                body: {
                    parts: [{ type: 'text', text: message }],
                    ...(session.parentAgent ? { agent: session.parentAgent } : {}),
                    ...modelContext,
                },
            });
        }
        catch {
            // Ignore notification errors
        }
    }
}
/**
 * Builds the `<pty_exited>` notification text for a finished PTY session.
 *
 * Shared between the V1 notifier (`NotificationManager`, delivered via the
 * SDK client's `promptAsync`) and the V2 notifier (delivered via the plugin
 * context's `ctx.session.prompt`).
 */
export function buildExitNotification(session, exitCode) {
    const lineCount = session.buffer.length;
    let lastLine = '';
    if (lineCount > 0) {
        for (let i = lineCount - 1; i >= 0; i--) {
            const bufferLines = session.buffer.read(i, 1);
            const line = bufferLines[0];
            if (line !== undefined && line.trim() !== '') {
                lastLine =
                    line.length > NOTIFICATION_LINE_TRUNCATE
                        ? `${line.slice(0, NOTIFICATION_LINE_TRUNCATE)}...`
                        : line;
                break;
            }
        }
    }
    const displayTitle = session.description ?? session.title;
    const truncatedTitle = displayTitle.length > NOTIFICATION_TITLE_TRUNCATE
        ? `${displayTitle.slice(0, NOTIFICATION_TITLE_TRUNCATE)}...`
        : displayTitle;
    const lines = [
        '<pty_exited>',
        `ID: ${session.id}`,
        `Description: ${truncatedTitle}`,
        `Exit Code: ${exitCode}`,
        `TimeoutSeconds: ${session.timeoutSeconds ?? 'none'}`,
        `Timed Out: ${session.timedOut ? 'yes' : 'no'}`,
        `Output Lines: ${lineCount}`,
        `Last Line: ${lastLine}`,
        '</pty_exited>',
        '',
    ];
    if (session.timedOut) {
        lines.push('Process reached its PTY timeout and was stopped automatically. Use pty_read to inspect the final output.');
    }
    else if (exitCode === 0) {
        lines.push('Use pty_read to check the full output.');
    }
    else {
        lines.push('Process failed. Use pty_read with the pattern parameter to search for errors in the output.');
    }
    return lines.join('\n');
}
//# sourceMappingURL=notification-manager.js.map
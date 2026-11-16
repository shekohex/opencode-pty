import { spawn } from 'bun-pty';
import { RingBuffer } from "./buffer.js";
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from "../constants.js";
const SESSION_ID_BYTE_LENGTH = 4;
function generateId() {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTE_LENGTH)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return `pty_${hex}`;
}
export class SessionLifecycleManager {
    sessions = new Map();
    sessionTimeouts = new Map();
    normalizeTimeoutSeconds(timeoutSeconds) {
        if (timeoutSeconds === undefined) {
            return undefined;
        }
        if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
            throw new Error('timeoutSeconds must be a positive integer in seconds');
        }
        return timeoutSeconds;
    }
    clearSessionTimeout(id) {
        const timeoutHandle = this.sessionTimeouts.get(id);
        if (!timeoutHandle) {
            return;
        }
        clearTimeout(timeoutHandle);
        this.sessionTimeouts.delete(id);
    }
    scheduleSessionTimeout(session) {
        if (session.timeoutSeconds === undefined) {
            return;
        }
        const timeoutMs = session.timeoutSeconds * 1000;
        const timeoutHandle = setTimeout(() => {
            this.sessionTimeouts.delete(session.id);
            const currentSession = this.sessions.get(session.id);
            if (!currentSession || currentSession.status !== 'running') {
                return;
            }
            // Persist the timeout reason before reusing the regular kill flow.
            currentSession.timedOut = true;
            currentSession.status = 'killing';
            try {
                currentSession.process?.kill();
            }
            catch {
                // Ignore kill errors
            }
        }, timeoutMs);
        this.sessionTimeouts.set(session.id, timeoutHandle);
    }
    createSessionObject(opts) {
        const id = generateId();
        const args = opts.args ?? [];
        const workdir = opts.workdir ?? process.cwd();
        const timeoutSeconds = this.normalizeTimeoutSeconds(opts.timeoutSeconds);
        const title = opts.title ?? (`${opts.command} ${args.join(' ')}`.trim() || `Terminal ${id.slice(-4)}`);
        const buffer = new RingBuffer();
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
            createdAt: new Date(),
            parentSessionId: opts.parentSessionId,
            parentAgent: opts.parentAgent,
            notifyOnExit: opts.notifyOnExit ?? false,
            timeoutSeconds,
            timedOut: false,
            buffer,
            process: null, // will be set
        };
    }
    spawnProcess(session) {
        const env = { ...process.env, ...session.env };
        const ptyProcess = spawn(session.command, session.args, {
            name: 'xterm-256color',
            cols: DEFAULT_TERMINAL_COLS,
            rows: DEFAULT_TERMINAL_ROWS,
            cwd: session.workdir,
            env,
        });
        session.process = ptyProcess;
        session.pid = ptyProcess.pid;
    }
    setupEventHandlers(session, onData, onExit) {
        session.process?.onData((data) => {
            session.buffer.append(data);
            onData(session, data);
        });
        session.process?.onExit(({ exitCode, signal }) => {
            this.clearSessionTimeout(session.id);
            // Flush any remaining incomplete line in the buffer
            session.buffer.flush();
            if (session.status === 'killing') {
                session.status = 'killed';
            }
            else {
                session.status = 'exited';
            }
            session.exitCode = exitCode;
            session.exitSignal = signal;
            // When the process stopped, so a reader can report how long it ran: the
            // buffer keeps the output but nothing else records the end.
            session.exitAt = new Date();
            onExit(session, exitCode);
        });
    }
    spawn(opts, onData, onExit) {
        const session = this.createSessionObject(opts);
        this.spawnProcess(session);
        this.setupEventHandlers(session, onData, onExit);
        this.sessions.set(session.id, session);
        this.scheduleSessionTimeout(session);
        return this.toInfo(session);
    }
    kill(id, cleanup = false) {
        const session = this.sessions.get(id);
        if (!session) {
            return false;
        }
        this.clearSessionTimeout(id);
        if (session.status === 'running') {
            session.status = 'killing';
            try {
                session.process?.kill();
            }
            catch {
                // Ignore kill errors
            }
        }
        if (cleanup) {
            session.buffer.clear();
            this.sessions.delete(id);
        }
        return true;
    }
    clearAllSessionsInternal() {
        for (const id of [...this.sessions.keys()]) {
            this.kill(id, true);
        }
    }
    clearAllSessions() {
        this.clearAllSessionsInternal();
    }
    cleanupBySession(parentSessionId) {
        for (const [id, session] of this.sessions) {
            if (session.parentSessionId === parentSessionId) {
                this.kill(id, true);
            }
        }
    }
    getSession(id) {
        return this.sessions.get(id) || null;
    }
    listSessions() {
        return Array.from(this.sessions.values());
    }
    toInfo(session) {
        return {
            id: session.id,
            title: session.title,
            description: session.description,
            command: session.command,
            args: session.args,
            workdir: session.workdir,
            status: session.status,
            notifyOnExit: session.notifyOnExit,
            timeoutSeconds: session.timeoutSeconds,
            timedOut: session.timedOut,
            exitCode: session.exitCode,
            exitSignal: session.exitSignal,
            exitAt: session.exitAt?.toISOString(),
            pid: session.pid,
            createdAt: session.createdAt.toISOString(),
            lineCount: session.buffer.length,
        };
    }
}
//# sourceMappingURL=session-lifecycle.js.map
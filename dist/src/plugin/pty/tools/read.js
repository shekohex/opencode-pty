import { tool } from '@opencode-ai/plugin';
import { manager } from "../manager.js";
import { DEFAULT_READ_LIMIT, MAX_LINE_LENGTH } from "../../../shared/constants.js";
import { buildSessionNotFoundError } from "../utils.js";
import { formatLine } from "../formatters.js";
import DESCRIPTION from './read.txt';
const NOTIFY_ON_EXIT_REMINDER = [
    `<system_reminder>`,
    `This session was started with \`notifyOnExit=true\`.`,
    `Completion signal is the future \`<pty_exited>\` message, not repeated \`pty_read\` calls.`,
    `If you only need to know whether the command finished, stop polling and wait for \`<pty_exited>\`.`,
    `Do not use sleep plus \`pty_read\` loops to check completion.`,
    `Use \`pty_read\` only when you need live output now, the user explicitly asks for logs, or the exit notification reports a non-zero status and you need to investigate.`,
    `</system_reminder>`,
].join('\n');
function buildTimeoutReminder(session) {
    return [
        `<system_reminder>`,
        `This session was auto-killed after reaching \`timeoutSeconds=${session.timeoutSeconds ?? 'unknown'}\`.`,
        `Use \`pty_read\` to inspect the final output or \`pty_list\` to review other sessions.`,
        `</system_reminder>`,
    ].join('\n');
}
/**
 * Formats PTY output with XML tags and pagination
 */
function formatPtyOutput(id, status, pattern, formattedLines, hasMore, paginationMessage, endMessage) {
    const output = [
        `<pty_output id="${id}" status="${status}"${pattern ? ` pattern="${pattern}"` : ''}>`,
        ...formattedLines,
        '',
        hasMore ? paginationMessage : endMessage,
        `</pty_output>`,
    ];
    return output.join('\n');
}
function appendNotifyOnExitReminder(output, session) {
    if (!session.notifyOnExit || session.status !== 'running') {
        return output;
    }
    return `${output}\n\n${NOTIFY_ON_EXIT_REMINDER}`;
}
function appendTimeoutReminder(output, session) {
    if (!session.timedOut) {
        return output;
    }
    return `${output}\n\n${buildTimeoutReminder(session)}`;
}
function appendSessionReminders(output, session) {
    return appendTimeoutReminder(appendNotifyOnExitReminder(output, session), session);
}
/**
 * Validates and creates a RegExp from pattern string
 */
function validateAndCreateRegex(pattern, ignoreCase) {
    if (!validateRegex(pattern)) {
        throw new Error(`Potentially dangerous regex pattern rejected: '${pattern}'. Please use a safer pattern.`);
    }
    try {
        return new RegExp(pattern, ignoreCase ? 'i' : '');
    }
    catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid regex pattern '${pattern}': ${error}`);
    }
}
/**
 * Handles pattern-based reading and formatting
 */
function handlePatternRead(id, pattern, ignoreCase, session, offset, limit) {
    const regex = validateAndCreateRegex(pattern, ignoreCase);
    const result = manager.search(id, regex, offset, limit);
    if (!result) {
        throw buildSessionNotFoundError(id);
    }
    if (result.matches.length === 0) {
        return appendSessionReminders([
            `<pty_output id="${id}" status="${session.status}" pattern="${pattern}">`,
            `No lines matched the pattern '${pattern}'.`,
            `Total lines in buffer: ${result.totalLines}`,
            `</pty_output>`,
        ].join('\n'), session);
    }
    const formattedLines = result.matches.map((match) => formatLine(match.text, match.lineNumber, MAX_LINE_LENGTH));
    const paginationMessage = `(${result.matches.length} of ${result.totalMatches} matches shown. Use offset=${offset + result.matches.length} to see more.)`;
    const endMessage = `(${result.totalMatches} match${result.totalMatches === 1 ? '' : 'es'} from ${result.totalLines} total lines)`;
    return appendSessionReminders(formatPtyOutput(id, session.status, pattern, formattedLines, result.hasMore, paginationMessage, endMessage), session);
}
/**
 * Handles plain reading and formatting
 */
function handlePlainRead(args, session, offset, limit) {
    const result = manager.read(args.id, offset, limit);
    if (!result) {
        throw buildSessionNotFoundError(args.id);
    }
    if (result.lines.length === 0) {
        return appendSessionReminders([
            `<pty_output id="${args.id}" status="${session.status}">`,
            `(No output available - buffer is empty)`,
            `Total lines: ${result.totalLines}`,
            `</pty_output>`,
        ].join('\n'), session);
    }
    const formattedLines = result.lines.map((line, index) => formatLine(line, result.offset + index + 1, MAX_LINE_LENGTH));
    const paginationMessage = `(Buffer has more lines. Use offset=${result.offset + result.lines.length} to read beyond line ${result.offset + result.lines.length})`;
    const endMessage = `(End of buffer - total ${result.totalLines} lines)`;
    return appendSessionReminders(formatPtyOutput(args.id, session.status, undefined, formattedLines, result.hasMore, paginationMessage, endMessage), session);
}
/**
 * Formats a single line with line number and truncation
 */
function validateRegex(pattern) {
    try {
        new RegExp(pattern);
        // Check for potentially dangerous patterns that can cause exponential backtracking
        // This is a basic check - more sophisticated validation could be added
        const dangerousPatterns = [
            /\(\?:.*\)\*.*\(\?:.*\)\*/, // nested optional groups with repetition
            /.*\(\.\*\?\)\{2,\}.*/, // overlapping non-greedy quantifiers
            /.*\(.*\|.*\)\{3,\}.*/, // complex alternation with repetition
        ];
        return !dangerousPatterns.some((dangerous) => dangerous.test(pattern));
    }
    catch {
        return false;
    }
}
export const ptyRead = tool({
    description: DESCRIPTION,
    args: {
        id: tool.schema.string().describe('The PTY session ID (e.g., pty_a1b2c3d4)'),
        offset: tool.schema
            .number()
            .optional()
            .describe('Line number to start reading from (0-based, defaults to 0). When using pattern, this applies to filtered matches.'),
        limit: tool.schema
            .number()
            .optional()
            .describe('Number of lines to read (defaults to 500). When using pattern, this applies to filtered matches.'),
        pattern: tool.schema
            .string()
            .optional()
            .describe('Regex pattern to filter lines. When set, only matching lines are returned, then offset/limit apply to the matches.'),
        ignoreCase: tool.schema
            .boolean()
            .optional()
            .describe('Case-insensitive pattern matching (default: false)'),
    },
    async execute(args) {
        const session = manager.get(args.id);
        if (!session) {
            throw buildSessionNotFoundError(args.id);
        }
        const offset = args.offset ?? 0;
        const limit = args.limit ?? DEFAULT_READ_LIMIT;
        if (args.pattern) {
            return handlePatternRead(args.id, args.pattern, args.ignoreCase, session, offset, limit);
        }
        else {
            return handlePlainRead(args, session, offset, limit);
        }
    },
});
//# sourceMappingURL=read.js.map
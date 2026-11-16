// Default buffer size in characters (approximately 1MB)
const DEFAULT_MAX_BUFFER_SIZE = parseInt(process.env.PTY_MAX_BUFFER_SIZE || '1000000', 10);
export class RingBuffer {
    buffer = '';
    maxSize;
    constructor(maxSize = DEFAULT_MAX_BUFFER_SIZE) {
        this.maxSize = maxSize;
    }
    append(data) {
        this.buffer += data;
        if (this.buffer.length > this.maxSize) {
            this.buffer = this.buffer.slice(-this.maxSize);
        }
    }
    splitBufferLines() {
        const lines = this.buffer.split('\n');
        // Remove empty string at end if buffer doesn't end with newline
        if (lines.length && lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines;
    }
    read(offset = 0, limit) {
        if (this.buffer === '')
            return [];
        const lines = this.splitBufferLines();
        const start = Math.max(0, offset);
        const end = limit !== undefined ? start + limit : lines.length;
        return lines.slice(start, end);
    }
    readRaw() {
        return this.buffer;
    }
    search(pattern) {
        const matches = [];
        const lines = this.splitBufferLines();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line && pattern.test(line)) {
                matches.push({ lineNumber: i + 1, text: line });
            }
        }
        return matches;
    }
    get length() {
        if (this.buffer === '')
            return 0;
        const lines = this.splitBufferLines();
        return lines.length;
    }
    get byteLength() {
        return this.buffer.length;
    }
    flush() {
        // No-op in new implementation
    }
    clear() {
        this.buffer = '';
    }
}
//# sourceMappingURL=buffer.js.map
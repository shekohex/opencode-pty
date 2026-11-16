// A missing, invalid or non-positive limit falls back to the default.
const envLimit = (name, fallback) => Math.max(0, Number(process.env[name])) || fallback;
export class RingBuffer {
    maxSize;
    maxLines;
    lines = [''];
    size = 0;
    constructor(maxSize = envLimit('PTY_MAX_BUFFER_SIZE', 1_000_000), maxLines = envLimit('PTY_MAX_BUFFER_LINES', 50_000)) {
        this.maxSize = maxSize;
        this.maxLines = maxLines;
    }
    append(data) {
        const lines = data.split('\n');
        this.lines[this.lines.length - 1] += lines[0] ?? '';
        for (let i = 1; i < lines.length; i++) {
            this.lines.push(lines[i] ?? '');
        }
        this.size += data.length;
        let start = 0;
        while (this.length - start > 1 &&
            (this.length - start > this.maxLines || this.size > this.maxSize)) {
            this.size -= (this.lines[start]?.length ?? 0) + 1;
            start++;
        }
        if (start > 0)
            this.lines.splice(0, start);
        if (this.size > this.maxSize) {
            this.lines[0] = this.lines[0]?.slice(this.size - this.maxSize) ?? '';
            this.size = this.maxSize;
        }
    }
    read(offset = 0, limit) {
        const lines = this.lines.slice(0, this.length);
        const start = Math.max(0, offset);
        const end = limit !== undefined ? start + limit : lines.length;
        return lines.slice(start, end);
    }
    readRaw() {
        return this.lines.join('\n');
    }
    search(pattern) {
        const matches = [];
        for (let i = 0; i < this.length; i++) {
            const line = this.lines[i];
            if (line && pattern.test(line)) {
                matches.push({ lineNumber: i + 1, text: line });
            }
        }
        return matches;
    }
    get length() {
        return this.lines.length - (this.lines[this.lines.length - 1] === '' ? 1 : 0);
    }
    get byteLength() {
        return Buffer.byteLength(this.readRaw());
    }
    /** Flush any remaining incomplete line in the buffer. */
    flush() {
        // No-op: the new line-based buffer always has complete lines since we
        // split on '\n' during append; flush is a compatibility no-op.
    }
    clear() {
        this.lines = [''];
        this.size = 0;
    }
}
//# sourceMappingURL=buffer.js.map
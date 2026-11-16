export interface SearchMatch {
    lineNumber: number;
    text: string;
}
export declare class RingBuffer {
    private readonly maxSize;
    private readonly maxLines;
    private lines;
    private size;
    constructor(maxSize?: number, maxLines?: number);
    append(data: string): void;
    read(offset?: number, limit?: number): string[];
    readRaw(): string;
    search(pattern: RegExp): SearchMatch[];
    get length(): number;
    get byteLength(): number;
    /** Flush any remaining incomplete line in the buffer. */
    flush(): void;
    clear(): void;
}
//# sourceMappingURL=buffer.d.ts.map
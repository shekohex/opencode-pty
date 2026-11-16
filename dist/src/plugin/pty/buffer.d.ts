export interface SearchMatch {
    lineNumber: number;
    text: string;
}
export declare class RingBuffer {
    private buffer;
    private maxSize;
    constructor(maxSize?: number);
    append(data: string): void;
    private splitBufferLines;
    read(offset?: number, limit?: number): string[];
    readRaw(): string;
    search(pattern: RegExp): SearchMatch[];
    get length(): number;
    get byteLength(): number;
    flush(): void;
    clear(): void;
}
//# sourceMappingURL=buffer.d.ts.map
import type { PTYSession, ReadResult, SearchResult } from './types.ts';
export declare class OutputManager {
    write(session: PTYSession, data: string): boolean;
    read(session: PTYSession, offset?: number, limit?: number): ReadResult;
    search(session: PTYSession, pattern: RegExp, offset?: number, limit?: number): SearchResult;
}
//# sourceMappingURL=output-manager.d.ts.map
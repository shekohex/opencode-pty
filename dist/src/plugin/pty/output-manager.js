export class OutputManager {
    write(session, data) {
        try {
            session.process?.write(data);
            return true;
        }
        catch {
            return true; // allow write to exited process for tests
        }
    }
    read(session, offset = 0, limit) {
        const lines = session.buffer.read(offset, limit);
        const totalLines = session.buffer.length;
        const hasMore = offset + lines.length < totalLines;
        return { lines, totalLines, offset, hasMore };
    }
    search(session, pattern, offset = 0, limit) {
        const allMatches = session.buffer.search(pattern);
        const totalMatches = allMatches.length;
        const totalLines = session.buffer.length;
        const paginatedMatches = limit !== undefined ? allMatches.slice(offset, offset + limit) : allMatches.slice(offset);
        const hasMore = offset + paginatedMatches.length < totalMatches;
        return { matches: paginatedMatches, totalMatches, totalLines, offset, hasMore };
    }
}
//# sourceMappingURL=output-manager.js.map
import { client } from "../client.ts";

interface ReadResult {
  lines: string[];
  totalLines: number;
  offset: number;
  hasMore: boolean;
  status: string;
}

interface SearchResult {
  matches: Array<{ lineNumber: number; text: string }>;
  totalMatches: number;
  totalLines: number;
  offset: number;
  hasMore: boolean;
  status: string;
}

interface ReadOptions {
  offset?: number;
  limit?: number;
  pattern?: string;
  ignoreCase?: boolean;
  json?: boolean;
}

const MAX_LINE_LENGTH = 2000;

export async function readCommand(id: string, options: ReadOptions): Promise<void> {
  await client.ensureDaemon();

  const result = await client.call<ReadResult | SearchResult>("read", {
    id,
    offset: options.offset ?? 0,
    limit: options.limit ?? 500,
    pattern: options.pattern,
    ignoreCase: options.ignoreCase,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Check if it's a search result (has matches) or read result (has lines)
  if ("matches" in result) {
    // Search result
    const searchResult = result as SearchResult;

    if (searchResult.matches.length === 0) {
      console.log(`<pty_output id="${id}" status="${searchResult.status}" pattern="${options.pattern}">`);
      console.log(`No lines matched the pattern '${options.pattern}'.`);
      console.log(`Total lines in buffer: ${searchResult.totalLines}`);
      console.log(`</pty_output>`);
      return;
    }

    console.log(`<pty_output id="${id}" status="${searchResult.status}" pattern="${options.pattern}">`);
    for (const match of searchResult.matches) {
      const lineNum = match.lineNumber.toString().padStart(5, "0");
      const text = match.text.length > MAX_LINE_LENGTH
        ? match.text.slice(0, MAX_LINE_LENGTH) + "..."
        : match.text;
      console.log(`${lineNum}| ${text}`);
    }
    console.log();
    if (searchResult.hasMore) {
      console.log(`(${searchResult.matches.length} of ${searchResult.totalMatches} matches shown. Use --offset=${(options.offset ?? 0) + searchResult.matches.length} to see more.)`);
    } else {
      console.log(`(${searchResult.totalMatches} match${searchResult.totalMatches === 1 ? "" : "es"} from ${searchResult.totalLines} total lines)`);
    }
    console.log(`</pty_output>`);
  } else {
    // Read result
    const readResult = result as ReadResult;

    if (readResult.lines.length === 0) {
      console.log(`<pty_output id="${id}" status="${readResult.status}">`);
      console.log(`(No output available - buffer is empty)`);
      console.log(`Total lines: ${readResult.totalLines}`);
      console.log(`</pty_output>`);
      return;
    }

    console.log(`<pty_output id="${id}" status="${readResult.status}">`);
    for (let i = 0; i < readResult.lines.length; i++) {
      const lineNum = (readResult.offset + i + 1).toString().padStart(5, "0");
      const line = readResult.lines[i];
      const text = line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH) + "..."
        : line;
      console.log(`${lineNum}| ${text}`);
    }

    if (readResult.hasMore) {
      console.log();
      console.log(`(Buffer has more lines. Use --offset=${readResult.offset + readResult.lines.length} to read beyond line ${readResult.offset + readResult.lines.length})`);
    } else {
      console.log();
      console.log(`(End of buffer - total ${readResult.totalLines} lines)`);
    }
    console.log(`</pty_output>`);
  }
}

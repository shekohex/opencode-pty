import { tool } from "@opencode-ai/plugin";
import { manager } from "../../../core/manager.ts";
import DESCRIPTION from "./read.txt";

const DEFAULT_LIMIT = 500;
const MAX_LINE_LENGTH = 2000;

export const ptyRead = tool({
  description: DESCRIPTION,
  args: {
    id: tool.schema.string().describe("The PTY session ID (e.g., pty_a1b2c3d4)"),
    offset: tool.schema.number().optional().describe("Line number to start reading from (0-based, defaults to 0). When using pattern, this applies to filtered matches."),
    limit: tool.schema.number().optional().describe("Number of lines to read (defaults to 500). When using pattern, this applies to filtered matches."),
    pattern: tool.schema.string().optional().describe("Regex pattern to filter lines. When set, only matching lines are returned, then offset/limit apply to the matches."),
    ignoreCase: tool.schema.boolean().optional().describe("Case-insensitive pattern matching (default: false)"),
  },
  async execute(args) {
    const session = manager.get(args.id);
    if (!session) {
      throw new Error(`PTY session '${args.id}' not found. Use pty_list to see active sessions.`);
    }

    const offset = args.offset ?? 0;
    const limit = args.limit ?? DEFAULT_LIMIT;

    if (args.pattern) {
      let regex: RegExp;
      try {
        regex = new RegExp(args.pattern, args.ignoreCase ? "i" : "");
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid regex pattern '${args.pattern}': ${error}`);
      }

      const result = manager.search(args.id, regex, offset, limit);
      if (!result) {
        throw new Error(`PTY session '${args.id}' not found.`);
      }

      if (result.matches.length === 0) {
        return [
          `<pty_output id="${args.id}" status="${session.status}" pattern="${args.pattern}">`,
          `No lines matched the pattern '${args.pattern}'.`,
          `Total lines in buffer: ${result.totalLines}`,
          `</pty_output>`,
        ].join("\n");
      }

      const formattedLines = result.matches.map((match) => {
        const lineNum = match.lineNumber.toString().padStart(5, "0");
        const truncatedLine = match.text.length > MAX_LINE_LENGTH ? match.text.slice(0, MAX_LINE_LENGTH) + "..." : match.text;
        return `${lineNum}| ${truncatedLine}`;
      });

      const output = [
        `<pty_output id="${args.id}" status="${session.status}" pattern="${args.pattern}">`,
        ...formattedLines,
        "",
      ];

      if (result.hasMore) {
        output.push(`(${result.matches.length} of ${result.totalMatches} matches shown. Use offset=${offset + result.matches.length} to see more.)`);
      } else {
        output.push(`(${result.totalMatches} match${result.totalMatches === 1 ? "" : "es"} from ${result.totalLines} total lines)`);
      }
      output.push(`</pty_output>`);

      return output.join("\n");
    }

    const result = manager.read(args.id, offset, limit);
    if (!result) {
      throw new Error(`PTY session '${args.id}' not found.`);
    }

    if (result.lines.length === 0) {
      return [
        `<pty_output id="${args.id}" status="${session.status}">`,
        `(No output available - buffer is empty)`,
        `Total lines: ${result.totalLines}`,
        `</pty_output>`,
      ].join("\n");
    }

    const formattedLines = result.lines.map((line, index) => {
      const lineNum = (result.offset + index + 1).toString().padStart(5, "0");
      const truncatedLine = line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + "..." : line;
      return `${lineNum}| ${truncatedLine}`;
    });

    const output = [
      `<pty_output id="${args.id}" status="${session.status}">`,
      ...formattedLines,
    ];

    if (result.hasMore) {
      output.push("");
      output.push(`(Buffer has more lines. Use offset=${result.offset + result.lines.length} to read beyond line ${result.offset + result.lines.length})`);
    } else {
      output.push("");
      output.push(`(End of buffer - total ${result.totalLines} lines)`);
    }
    output.push(`</pty_output>`);

    return output.join("\n");
  },
});

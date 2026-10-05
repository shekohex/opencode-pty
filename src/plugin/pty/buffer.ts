// A missing, invalid or non-positive limit falls back to the default.
const envLimit = (name: string, fallback: number) =>
  Math.max(0, Number(process.env[name])) || fallback

export interface SearchMatch {
  lineNumber: number
  text: string
}

export class RingBuffer {
  private lines: string[] = ['']
  private size = 0

  constructor(
    private readonly maxSize = envLimit('PTY_MAX_BUFFER_SIZE', 1_000_000),
    private readonly maxLines = envLimit('PTY_MAX_BUFFER_LINES', 50_000)
  ) {}

  append(data: string): void {
    const lines = data.split('\n')
    this.lines[this.lines.length - 1] += lines[0] ?? ''
    for (let i = 1; i < lines.length; i++) {
      this.lines.push(lines[i] ?? '')
    }
    this.size += data.length

    let start = 0
    while (
      this.length - start > 1 &&
      (this.length - start > this.maxLines || this.size > this.maxSize)
    ) {
      this.size -= (this.lines[start]?.length ?? 0) + 1
      start++
    }
    if (start > 0) this.lines.splice(0, start)
    if (this.size > this.maxSize) {
      this.lines[0] = this.lines[0]?.slice(this.size - this.maxSize) ?? ''
      this.size = this.maxSize
    }
  }

  read(offset: number = 0, limit?: number): string[] {
    const lines = this.lines.slice(0, this.length)
    const start = Math.max(0, offset)
    const end = limit !== undefined ? start + limit : lines.length
    return lines.slice(start, end)
  }

  readRaw(): string {
    return this.lines.join('\n')
  }

  search(pattern: RegExp): SearchMatch[] {
    const matches: SearchMatch[] = []
    for (let i = 0; i < this.length; i++) {
      const line = this.lines[i]
      if (line && pattern.test(line)) {
        matches.push({ lineNumber: i + 1, text: line })
      }
    }
    return matches
  }

  get length(): number {
    return this.lines.length - (this.lines[this.lines.length - 1] === '' ? 1 : 0)
  }

  get byteLength(): number {
    return Buffer.byteLength(this.readRaw())
  }

  clear(): void {
    this.lines = ['']
    this.size = 0
  }
}

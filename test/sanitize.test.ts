import { afterEach, describe, expect, it } from 'bun:test'
import { isOutputSanitizationEnabled, sanitizeTerminalText } from '../src/plugin/pty/sanitize.ts'

// What ConPTY writes before the first byte of real output on Windows.
const CONPTY_PREAMBLE =
  '\x1b[?9001h\x1b[?1004h\x1b[?25l\x1b[2J\x1b[m\x1b[H' +
  '\x1b]0;C:\\Program Files\\PowerShell\\7\\pwsh.EXE\x07\x1b[?25h'

describe('sanitizeTerminalText', () => {
  it('removes SGR colours and erase sequences', () => {
    expect(sanitizeTerminalText('\x1b[31merror:\x1b[0m boom\x1b[K')).toBe('error: boom')
  })

  it('removes terminal mode, cursor and screen sequences', () => {
    expect(sanitizeTerminalText(CONPTY_PREAMBLE)).toBe('')
    expect(sanitizeTerminalText('\x1b[12;1Hready\x1b[?7777h')).toBe('ready')
  })

  it('removes OSC sequences terminated by BEL or ST', () => {
    expect(sanitizeTerminalText('\x1b]0;title\x07a')).toBe('a')
    expect(sanitizeTerminalText('\x1b]2;~/my dir\x1b\\a')).toBe('a')
    expect(sanitizeTerminalText('\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\')).toBe('link')
  })

  it('removes DCS/APC strings and unterminated string sequences', () => {
    expect(sanitizeTerminalText('a\x1bPq#0;1;2\x1b\\b')).toBe('ab')
    expect(sanitizeTerminalText('a\x1b_payload\x1b\\b')).toBe('ab')
    expect(sanitizeTerminalText('a\x1b]0;cut off')).toBe('a')
  })

  it('removes remaining control characters but keeps tabs', () => {
    expect(sanitizeTerminalText('a\tb\r')).toBe('a\tb')
    expect(sanitizeTerminalText('bell\x07 back\x08 nul\x00 del\x7f c1\x9b')).toBe(
      'bell back nul del c1'
    )
    expect(sanitizeTerminalText('trailing escape\x1b')).toBe('trailing escape')
  })

  it('leaves plain and non-ASCII text untouched', () => {
    expect(sanitizeTerminalText('héllo wörld ✓ 你好')).toBe('héllo wörld ✓ 你好')
    expect(sanitizeTerminalText('  indented\tcode')).toBe('  indented\tcode')
  })

  it('drops trailing padding, with or without control sequences', () => {
    // ConPTY renders an erased line as text padded with spaces to the width.
    expect(sanitizeTerminalText(`done${' '.repeat(116)}`)).toBe('done')
    expect(sanitizeTerminalText(`\x1b[32mdone${' '.repeat(116)}\x1b[0m\r`)).toBe('done')
  })
})

describe('isOutputSanitizationEnabled', () => {
  const original = process.env.PTY_SANITIZE_OUTPUT

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PTY_SANITIZE_OUTPUT
    } else {
      process.env.PTY_SANITIZE_OUTPUT = original
    }
  })

  it('is enabled by default', () => {
    delete process.env.PTY_SANITIZE_OUTPUT
    expect(isOutputSanitizationEnabled()).toBe(true)
  })

  it('is disabled by 0 or false', () => {
    for (const value of ['0', 'false', 'FALSE', ' false ']) {
      process.env.PTY_SANITIZE_OUTPUT = value
      expect(isOutputSanitizationEnabled()).toBe(false)
    }
  })

  it('stays enabled for other values', () => {
    for (const value of ['1', 'true', '']) {
      process.env.PTY_SANITIZE_OUTPUT = value
      expect(isOutputSanitizationEnabled()).toBe(true)
    }
  })
})
